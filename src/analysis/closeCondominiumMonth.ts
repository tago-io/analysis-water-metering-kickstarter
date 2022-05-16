import { Utils, Services, Account, Device, Analysis, Types } from "@tago-io/sdk";
import { Data } from "@tago-io/sdk/out/common/common.types";
import { TagoContext } from "@tago-io/sdk/out/modules/Analysis/analysis.types";
import moment from "moment-timezone";
import { fetchDeviceList } from "../lib/fetchDeviceList";

async function uploadFileToTago(account: Account, csvstring: string) {
  const file_id = Date.now();
  const csvbase64 = Buffer.from(csvstring).toString("base64");

  const filename = `reports/${file_id}_${moment().format("DD_MM_YYYY_HH_mm_ss")}.csv`;
  // @ts-ignore: Unreachable code error
  await account.files.uploadBase64([{ filename, file: csvbase64, public: true }]);

  // const file = await account.files.list({ quantity: 1 });

  //must be dynamic
  const file_url = `https://api.tago.io/file/${"62728b407a9ed70012d634c8"}/${filename}`;

  return file_url;
}

async function generateCSVDevice(account: Account, meter_name: string, date: string, consumption: number, last_consumption: number) {
  let dev_csv = "";

  // consumption_list.forEach((item, index, array) => {
  //   const prev_value = index === 0 ? item.value : array[index - 1].value;
  //   const diff = Number(item.value) - Number(prev_value);
  //   dev_csv = `${dev_csv}\n ${apto.value}, ${item.time}, ${Number(prev_value).toFixed(3)}, ${Number(item.value).toFixed(3)}, ${Number(diff).toFixed(3)}`;
  // });

  let consumption_diff: string | number = "N/A";

  if (last_consumption !== 0 && consumption !== 0) {
    consumption_diff = ((consumption - last_consumption) / last_consumption) * 100;
  }

  dev_csv = `\r\n${meter_name}, ${date}, ${consumption}, ${last_consumption}, ${Number(consumption_diff).toFixed(2)}%`;

  return dev_csv;
}

async function report(context: TagoContext, scope: Data[]): Promise<void> {
  context.log("Running Analysis");

  const environment_variables = Utils.envToJson(context.environment);
  if (!environment_variables) {
    throw "Missing environment variables";
  }

  if (!environment_variables.config_token) {
    throw "Missing config_token environment var";
  } else if (!environment_variables.account_token) {
    throw "Missing account_token environment var";
  }

  const config_dev = new Device({ token: environment_variables.config_token });
  const account = new Account({ token: environment_variables.account_token });

  const action_info = await account.actions.info(environment_variables._action_id);
  // const action_info = await account.actions.info("627a490bdec74600118453ba");

  // @ts-ignore: Unreachable code error
  const org_id = action_info.tags.find((x) => x.key === "org_id").value;

  const org_dev = await Utils.getDevice(account, org_id);

  const [org_id_data] = await org_dev.getData({ variables: "org_id", qty: 1 });

  const end_date = moment.utc().format();
  const start_date = moment.utc(end_date).subtract(1, "month").format();

  const start_tz = moment(start_date).tz("UTC").format("DD-MM-YYYY HH:mm:ss");
  const end_tz = moment(end_date).tz("UTC").format("DD-MM-YYYY HH:mm:ss");

  const meter_list = await fetchDeviceList(account, [
    { key: "sensor", value: "meter" },
    { key: "organization_id", value: org_id },
  ]);
  if (!meter_list.length) {
    throw "No water meter has been created for this condominium.";
  }

  let csv = "Water Meter, Reading Date, Consumption (m³), Last Consumption (m³), Increase Since Last Consumption";
  for (const meter of meter_list) {
    //0ing the consumption and create month consumption historic info
    const meter_dev = await Utils.getDevice(account, meter.id);
    const [consumption_data] = await meter_dev.getData({ variables: "current_cons", qty: 1 });
    const [last_consumption_data] = await meter_dev.getData({ variables: "monthly_volume", qty: 1 });

    const consumption = consumption_data?.value || 0;
    const last_consumption = last_consumption_data?.value || 0;

    await meter_dev.sendData({ variable: "monthly_volume", value: consumption, group: moment(end_date).format("MMMM") });

    await meter_dev.sendData({ variable: "current_cons", value: 0, time: new Date() });

    csv = `${csv} ${await generateCSVDevice(account, meter.name, end_tz, Number(consumption), Number(last_consumption))}`;
  }

  const fileurl = await uploadFileToTago(account, csv);

  //zero the condominium total consumption also
  const [org_monthly_consumption] = await org_dev.getData({ variables: "total_cond_cons", qty: 1 });
  await org_dev.sendData([{ variable: "monthly_consumption", value: org_monthly_consumption?.value || 0, group: moment(end_date).format("MMMM") }]);

  await org_dev.deleteData({ variables: "current_cons", qty: 9999 });

  await org_dev.sendData([
    {
      variable: "csv_report_date",
      value: `Start date: ${start_tz}, End date: ${end_tz}`,
    },
    {
      variable: "csv_report_download",
      value: "Download CSV",
      metadata: { url: fileurl },
    },
  ]);
}

async function startAnalysis(context: TagoContext, scope: any) {
  try {
    await report(context, scope);
    context.log("Analysis finished");
  } catch (error) {
    console.log(error);
    context.log(error.message || JSON.stringify(error));
  }
}

export default new Analysis(startAnalysis, { token: "03bc53ba-7d2c-48fb-8d77-3b4e46fd776e" });
