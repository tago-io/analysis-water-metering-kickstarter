import { Account, Device, Types, Utils } from "@tago-io/sdk";
import { DeviceCreateInfo } from "@tago-io/sdk/lib/types";

import { parseTagoObject } from "../../lib/data.logic";
import { fetchDeviceList } from "../../lib/fetchDeviceList";
import { findDashboardByExportID } from "../../lib/findResource";
import validation from "../../lib/validation";
import { DeviceCreated, RouterConstructorData } from "../../types";

interface installDeviceParam {
  account: Account;
  new_group_name: string;
  org_id: string;
}

async function installDevice({ account, new_group_name, org_id }: installDeviceParam) {
  //structuring data
  const device_data: DeviceCreateInfo = {
    name: new_group_name,
    network: "5bbd0d144051a50034cd19fb",
    connector: "5f5a8f3351d4db99c40dece5",
    type: "mutable",
  };

  //creating new device
  const new_group = await account.devices.create(device_data);

  //inserting device id -> so we can reference this later
  await account.devices.edit(new_group.device_id, {
    tags: [
      { key: "user_group_id", value: new_group.device_id },
      { key: "group_id", value: new_group.device_id },
      { key: "organization_id", value: org_id },
      { key: "device_type", value: "group" },
    ],
  });

  //instantiating new device
  const new_org_dev = new Device({ token: new_group.token });

  //token, device_id, bucket_id
  return { ...new_group, device: new_org_dev } as DeviceCreated;
}

export default async ({ config_dev, context, scope, account, environment }: RouterConstructorData) => {
  const org_id = scope[0].device as string;
  const org_dev = await Utils.getDevice(account, org_id);

  const validate = validation("group_validation", org_dev);
  validate("#VAL.REGISTERING#", "warning");

  //Collecting data
  // const new_group_org = scope.find((x) => x.variable === "new_group_org");
  const new_group_name = scope.find((x) => x.variable === "new_group_name");
  const new_group_address = scope.find((x) => x.variable === "new_group_address");

  if ((new_group_name.value as string).length < 3) {
    throw validate("#VAL.NAME_FIELD_IS_SMALLER_THAN_3_CHAR#", "danger");
  }

  const [group_exists] = await org_dev.getData({ variables: "group_name", values: new_group_name.value, qty: 1 }); /** */

  if (group_exists) {
    throw validate("#VAL.GROUP_ALREADY_EXISTS#", "danger");
  }

  const { device_id: group_id, device: group_dev } = await installDevice({ account, new_group_name: new_group_name.value as string, org_id });

  const dash_sensor_list_id = await findDashboardByExportID(account, "dash_sensor_list");

  const url = `https://admin.tago.io/dashboards/info/${dash_sensor_list_id}?org_dev=${org_id}&group_dev=${group_id}`;

  const group_data = {
    group_id: {
      value: group_id,
      metadata: {
        label: new_group_name.value,
        url,
      },
      location: new_group_address.location,
    },
  };

  await account.devices.paramSet(group_id, {
    key: "dashboard_url",
    value: url,
    sent: false,
  });
  await account.devices.paramSet(group_id, { key: "group_address", value: (new_group_address?.value as string) || "N/A", sent: false });

  //send to organization device
  await org_dev.sendData(parseTagoObject(group_data, group_id));
  await config_dev.sendData(parseTagoObject(group_data, org_id));

  //uploading a default layer

  return validate("#VAL.GROUP_SUCCESSFULLY_CREATED#", "success");
};
