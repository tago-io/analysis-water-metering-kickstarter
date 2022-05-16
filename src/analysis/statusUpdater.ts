/*
 * KickStarter Analysis
 * Status Updater
 *
 * This analysis is responsible to update organization's plan usage (displayed at Info Dashboard),
 * update the indicators from the organization (total, active and inactive),
 * update sensor's last checkin parameter and update sensors location.
 *
 * Status Updater will run when:
 * - When the scheduled action (Status Updater Trigger) triggers this script. (Default 1 minute)
 *
 * How to setup this analysis
 * Make sure you have the following enviroment variables:
 * - account_token: the value must be a token from your profile. See how to generate account-token at: https://help.tago.io/portal/en/kb/articles/495-account-token.
 */

import { Utils, Services, Account, Device, Types, Analysis } from "@tago-io/sdk";
import { Data } from "@tago-io/sdk/out/common/common.types";
import { ConfigurationParams, DeviceListItem } from "@tago-io/sdk/out/modules/Account/devices.types";
import { TagoContext } from "@tago-io/sdk/out/modules/Analysis/analysis.types";
import moment from "moment-timezone";
import { parseTagoObject } from "../lib/data.logic";
import { fetchDeviceList } from "../lib/fetchDeviceList";
import { checkinTrigger } from "../services/alerts/checkinAlerts";

async function resolveSubgroup(account: Account, subgroup: DeviceListItem) {
  let total_qty = 0;
  let active_qty = 0;
  let inactivy_qty = 0;
  const subgroup_id = subgroup.id;

  const sensorList = await fetchDeviceList(account, [
    { key: "subgroup_id", value: subgroup.id },
    { key: "device_type", value: "device" },
  ]);

  sensorList.forEach((sensor) => {
    const last_input = moment(sensor.last_input);
    const now = moment();
    const diff_time = now.diff(last_input, "hours");
    total_qty++;
    if (diff_time < 24) {
      active_qty++;
    } else {
      inactivy_qty++;
    }
  });

  const subgroup_dev = await Utils.getDevice(account, subgroup_id);

  const to_tago = {
    total_qty,
    active_qty,
    inactivy_qty,
  };
  //CONSIDER INSTEAD OF DELETEING VARIABLES, PLACE A DATA RETENTION RULE AND SHOW THEM IN A HISTORIC GRAPIHC ON THE WIDGET HEADER BUTTON
  await subgroup_dev.deleteData({
    variables: ["total_qty", "active_qty", "inactivy_qty"],
    qty: 9999,
  });
  await subgroup_dev.sendData(parseTagoObject(to_tago));
}

async function resolveDevice(context: TagoContext, account: Account, org_id: string, device_id: string) {
  const device_info = await account.devices.info(device_id);

  const checkin_date = moment(device_info.last_input as Date);

  if (!checkin_date) {
    return "no data";
  }

  let diff_hours: string | number = moment().diff(checkin_date, "hours");

  if (diff_hours !== diff_hours) {
    diff_hours = "N/A";
  } //checking for NaN

  const device_params = await account.devices.paramList(device_id);
  const dev_lastcheckin_param = device_params.find((param) => param.key === "dev_lastcheckin") || { key: "dev_lastcheckin", value: String(diff_hours), sent: false };

  await checkinTrigger(account, context, org_id, { device_id, last_input: device_info.last_input });

  await account.devices.paramSet(device_id, { ...dev_lastcheckin_param, value: String(diff_hours), sent: diff_hours >= 24 ? true : false });
}

async function resolveOrg(account: Account, org_id: string) {
  let registered_group_qty = 0;
  let registered_subgroup_qty = 0;

  const group_list = await fetchDeviceList(account, [
    { key: "organization_id", value: org_id },
    { key: "device_type", value: "group" },
  ]);

  const subgroup_list = await fetchDeviceList(account, [
    { key: "organization_id", value: org_id },
    { key: "device_type", value: "subgroup" },
  ]);

  registered_group_qty = group_list.length;
  registered_subgroup_qty = subgroup_list.length;

  const org_dev = await Utils.getDevice(account, org_id);

  await org_dev.deleteData({ variables: ["total_group_qty", "total_subgroup_qty"] });

  org_dev.sendData([
    { variable: "total_group_qty", value: registered_group_qty },
    { variable: "total_subgroup_qty", value: registered_subgroup_qty },
  ]);
}

async function handler(context: TagoContext, scope: Data[]): Promise<void> {
  context.log("Running Analysis");

  const environment = Utils.envToJson(context.environment);
  if (!environment) {
    return;
  } else if (!environment.config_token) {
    throw "Missing config_token environment var";
  } else if (!environment.account_token) {
    throw "Missing account_token environment var";
  }

  const config_dev = new Device({ token: environment.config_token });
  const account = new Account({ token: environment.account_token });

  const orgList = await fetchDeviceList(account, [{ key: "device_type", value: "organization" }]);

  orgList.map((org) => resolveOrg(account, org.id));

  const subgroupList = await fetchDeviceList(account, [{ key: "device_type", value: "subgroup" }]);

  subgroupList.map((subgroup) => resolveSubgroup(account, subgroup));

  const sensorList = await fetchDeviceList(account, [{ key: "device_type", value: "device" }]);

  sensorList.map((device) =>
    resolveDevice(context, account, device.tags.find((tag) => tag.key === "organization_id")?.value as string, device.tags.find((tag) => tag.key === "device_id")?.value as string)
  );
}

async function startAnalysis(context: TagoContext, scope: any) {
  try {
    await handler(context, scope);
    context.log("Analysis finished");
  } catch (error) {
    console.log(error);
    context.log(error.message || JSON.stringify(error));
  }
}

export default new Analysis(startAnalysis, { token: "5e8803f6-d0ad-451f-9dfd-8c82343044ba" });
