import { Utils } from "@tago-io/sdk";

import { fetchDeviceList } from "../../lib/fetchDeviceList";
import { RouterConstructorDevice } from "../../types";

export default async ({ config_dev, context, scope, account, environment }: RouterConstructorDevice) => {
  const subgroup_id = (scope[0] as any).device;
  if (!subgroup_id) {
    return;
  }

  const subgroup_info = await account.devices.info(subgroup_id);
  const group_id = subgroup_info.tags.find((x) => x.key === "group_id").value;
  const group_dev = await Utils.getDevice(account, group_id);

  const device_list = await fetchDeviceList(account, [
    { key: "device_type", value: "device" },
    { key: "subgroup_id", value: subgroup_id },
  ]);

  //removing subgroup tag
  device_list.forEach((device) => {
    const device_tags = device.tags.filter((x: any) => x.key !== "subgroup_id");
    device_tags.push({ key: "subgroup_id", value: "N/A" });
    account.devices.edit(device.id, { tags: device_tags });
  });

  account.devices.delete(subgroup_id);
  group_dev.deleteData({ groups: subgroup_id, qty: 9999 });
  config_dev.deleteData({ variables: "subgroup_id", values: subgroup_id, qty: 1 });
};
