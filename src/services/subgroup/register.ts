import { Account, Device, Types, Utils } from "@tago-io/sdk";
import { DeviceCreateInfo } from "@tago-io/sdk/lib/types";

import { parseTagoObject } from "../../lib/data.logic";
import { findDashboardByExportID } from "../../lib/findResource";
import validation from "../../lib/validation";
import { DeviceCreated, RouterConstructorData } from "../../types";

interface installDeviceParam {
  account: Account;
  new_subgroup_name: string;
  org_id: string;
  group_id: string;
}

async function installDevice({ account, new_subgroup_name, org_id, group_id }: installDeviceParam) {
  //structuring data
  const device_data: DeviceCreateInfo = {
    name: new_subgroup_name,
    network: "5bbd0d144051a50034cd19fb",
    connector: "5f5a8f3351d4db99c40dece5",
    type: "mutable",
  };

  //creating new device
  const new_subgroup = await account.devices.create(device_data);

  //inserting device id -> so we can reference this later
  await account.devices.edit(new_subgroup.device_id, {
    tags: [
      { key: "subgroup_id", value: new_subgroup.device_id },
      { key: "group_id", value: group_id },
      { key: "organization_id", value: org_id },
      { key: "device_type", value: "subgroup" },
    ],
  });

  //instantiating new device
  const new_org_dev = new Device({ token: new_subgroup.token });

  //token, device_id, bucket_id
  return { ...new_subgroup, device: new_org_dev } as DeviceCreated;
}

export default async ({ config_dev, context, scope, account, environment }: RouterConstructorData) => {
  const group_id = scope[0].device as string;
  const group_dev = await Utils.getDevice(account, group_id);

  const { tags: group_tags } = await group_dev.info();
  const org_id = group_tags.find((x) => x.key === "organization_id").value;

  const validate = validation("subgroup_validation", group_dev);
  validate("#VAL.REGISTERING#", "warning");

  //Collecting data
  const new_subgroup_name = scope.find((x) => x.variable === "new_subgroup_name");
  const new_subgroup_type = scope.find((x) => x.variable === "new_subgroup_type");

  if ((new_subgroup_name.value as string).length < 3) {
    throw validate("#VAL.NAME_FIELD_IS_SMALLER_THAN_3_CHAR#", "danger");
  }

  const { device_id: subgroup_id, device: subgroup_dev } = await installDevice({ account, new_subgroup_name: new_subgroup_name.value as string, org_id, group_id });

  const subgroup_data = {
    subgroup_id: {
      value: subgroup_id,
      metadata: {
        label: new_subgroup_name.value,
        group: group_id,
        type: new_subgroup_type.value,
      },
    },
  };

  const dash_groupsummary_id = await findDashboardByExportID(account, "dash_my_apartment");

  await account.devices.paramSet(subgroup_id, {
    key: "dashboard_url",
    value: `https://admin.tago.io/dashboards/info/${dash_groupsummary_id}?&org_dev=${org_id}?&group_dev=${group_id}?&subgroup_dev=${subgroup_id}`,
  });

  await account.devices.paramSet(subgroup_id, {
    key: "type",
    value: new_subgroup_type.value as string,
  });

  await group_dev.sendData(parseTagoObject(subgroup_data, subgroup_id));
  await config_dev.sendData(parseTagoObject(subgroup_data, group_id));

  return validate("Apartment succesfully created!", "success");
};
