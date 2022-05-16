import { Device, Account, Types } from "@tago-io/sdk";
import { TagsObj } from "@tago-io/sdk/out/common/common.types";
import { DeviceCreateInfo } from "@tago-io/sdk/out/modules/Account/devices.types";
import moment from "moment";
import { parseTagoObject } from "../../lib/data.logic";
import { findAnalysisByExportID, findDashboardByExportID } from "../../lib/findResource";
import validation from "../../lib/validation";
import { DeviceCreated, RouterConstructorData } from "../../types";

interface installDeviceParam {
  account: Account;
  new_org_name: string;
}

async function sendMonthsVariable(org_dev: Device) {
  const month_list = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // const month_list = months.split(",");

  month_list.forEach((month, index) => {
    org_dev.sendData({
      variable: "monthly_volume_group",
      value: month,
      group: month,
      time: moment().month(index).toISOString(),
    });
  });
}

async function createAction(account: Account, cond_name: string, day: string, org_id: string) {
  const next_day = Number(day); // +1 ? send report in the next day of duedate

  const script_id = await findAnalysisByExportID(account, "closeCondominiumMonth");

  const action_obj = {
    name: `[${cond_name.toUpperCase()}] - Action to close condominium month reading`,
    type: "schedule",
    active: true,
    lock: false,
    action: {
      script: [script_id],
      type: "script",
    },
    tags: [{ key: "org_id", value: org_id }],
    trigger: [
      {
        cron: `00 12 ${next_day} */1 *`,
        timezone: "UTC",
      },
    ],
  };

  // @ts-ignore: Unreachable code error
  const create_act = await account.actions.create(action_obj);
  return create_act.action;
}

async function installDevice({ account, new_org_name }: installDeviceParam) {
  //structuring data
  const device_data: DeviceCreateInfo = {
    name: new_org_name,
    network: "5bbd0d144051a50034cd19fb",
    connector: "5f5a8f3351d4db99c40dece5",
    type: "mutable",
  };

  //creating new device
  const new_org = await account.devices.create(device_data);

  //inserting device id -> so we can reference this later
  await account.devices.edit(new_org.device_id, {
    tags: [
      { key: "organization_id", value: new_org.device_id },
      { key: "user_org_id", value: new_org.device_id },
      { key: "device_type", value: "organization" },
    ],
  });

  //instantiating new device
  const new_org_dev = new Device({ token: new_org.token });

  //token, device_id, bucket_id
  return { ...new_org, device: new_org_dev } as DeviceCreated;
}
export default async ({ config_dev, context, scope, account, environment }: RouterConstructorData) => {
  //validation
  const validate = validation("org_validation", config_dev);
  validate("#VAL.RESGISTERING#", "warning");

  //Collecting data
  const new_org_name = scope.find((x) => x.variable === "new_org_name");
  const new_org_address = scope.find((x) => x.variable === "new_org_address");
  const new_org_close_day = scope.find((x) => x.variable === "new_org_close_day");

  if ((new_org_name.value as string).length < 3) {
    throw validate("Name field is smaller than 3 character", "danger");
  }

  const [org_exists] = await config_dev.getData({ variables: "org_name", values: new_org_name.value, qty: 1 }); /** */
  const { id: config_dev_id } = await config_dev.info();

  if (org_exists) {
    throw validate("#VAL.ORG_ALREADY_EXISTS#", "danger");
  }

  //need device id to configure group in parseTagoObject
  //creating new device
  const { device_id, device: org_dev } = await installDevice({ account, new_org_name: new_org_name.value as string });

  const dash_groups_id = await findDashboardByExportID(account, "dash_groups");

  await account.devices.paramSet(device_id, {
    key: "dashboard_url",
    value: `https://admin.tago.io/dashboards/info/${dash_groups_id}?settings=${config_dev_id}&org_dev=${device_id}`,
  });
  await account.devices.paramSet(device_id, { key: "org_address", value: (new_org_address?.value as string) || "N/A", sent: false });
  await account.devices.paramSet(device_id, { key: "org_close_day", value: new_org_close_day.value as string, sent: false });

  const action_id = await createAction(account, new_org_name.value as string, new_org_close_day.value as string, device_id);

  const org_data = {
    org_id: { value: device_id, metadata: { label: new_org_name.value, action_id }, location: new_org_address?.location },
  };

  await config_dev.sendData(parseTagoObject(org_data, device_id));

  validate("#VAL.ORGANIZATION_SUCCESSFULLY_CREATED#", "success");

  const current_dashboard_id = context.environment.find((x) => x?.key === "_dashboard_id")?.value;
  await account.dashboards.edit(current_dashboard_id, {}).catch((msg) => console.log(msg));

  //creating variables for the Montly consumption history (m³) chart, group X axis (only the first time)

  await sendMonthsVariable(org_dev);

  return device_id;
};
