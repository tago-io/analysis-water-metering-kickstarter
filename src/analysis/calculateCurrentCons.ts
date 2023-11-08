import { Account, Analysis, Utils } from "@tago-io/sdk";
import { Data, DeviceInfo, TagoContext } from "@tago-io/sdk/lib/types";

async function sendVolumeToOrg(account: Account, meter_dev_info: DeviceInfo, current_volume_read: number) {
  const org_id = meter_dev_info.tags.find((t) => t.key === "organization_id")?.value;
  if (!org_id) {
    return;
  }

  const org_dev = await Utils.getDevice(account, org_id);
  await org_dev.deleteData({ variables: "current_cons", groups: meter_dev_info.id });
  await org_dev.sendData([{ variable: "current_cons", value: current_volume_read, group: meter_dev_info.id }]);
}

async function calculateConsumption(context: TagoContext, scope: Data[]): Promise<void> {
  context.log("Running Analysis");
  context.log(JSON.stringify(scope));
  const environment = Utils.envToJson(context.environment);
  if (!environment) {
    return;
  } else if (!environment.account_token) {
    throw "Missing account_token environment var";
  }

  const account = new Account({ token: environment.account_token });

  const { device: device_id } = scope[0];

  const current_volume_read = scope.find((x) => x.variable === "current_volume");
  const status_code = scope.find((x) => x.variable === "status_code");

  const meter_dev = await Utils.getDevice(account, device_id);
  const meter_dev_info = (await meter_dev.info()) as DeviceInfo;

  //current_volume -> uplink from the sensor
  const [last_volume] = await meter_dev.getData({ variables: "current_volume", end_date: current_volume_read.time, skip: 1, qty: 1 });
  const [current_cons] = await meter_dev.getData({ variables: "current_cons", end_date: current_volume_read.time, qty: 1 });

  const serie = current_volume_read.group || String(new Date().getTime());
  // const time = current_volume_read.time || new Date().toISOString();

  if (!last_volume?.value && last_volume?.value !== 0) {
    await meter_dev.sendData({ variable: "current_cons", value: 0, group: serie });
    return context.log("First reading.. skipped..");
  }

  let volume_difference = 0;
  // will be greather than curretn only when update "volume" manually
  if (last_volume.value > current_volume_read.value) {
    volume_difference = Number(current_volume_read.value);
    // return context.log(`Current volume (${current_volume_read.value}) can't be greater than last volume (${last_volume.value})`);
  } else {
    volume_difference = Number(current_volume_read.value) - Number(last_volume.value);
  }

  const new_current_cons = volume_difference + Number(current_cons?.value || 0);

  await meter_dev.sendData({ variable: "current_cons", value: new_current_cons, serie });

  sendVolumeToOrg(account, meter_dev_info, new_current_cons);
}

async function startAnalysis(context: TagoContext, scope: any) {
  try {
    await calculateConsumption(context, scope);
    context.log("Analysis finished");
  } catch (error) {
    console.log(error);
    context.log(error.message || JSON.stringify(error));
  }
}

export default new Analysis(startAnalysis, { token: "e9960c41-46aa-4ee8-8db8-a157c0c8c2a1" });
