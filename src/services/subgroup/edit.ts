import { Utils } from "@tago-io/sdk";
import { RouterConstructorDevice } from "../../types";

export default async ({ config_dev, context, scope, account, environment }: RouterConstructorDevice) => {
  const subgroup_id = (scope[0] as any).device;
  const new_subgroup_name = (scope[0] as any).name;

  if (!new_subgroup_name) {
    return "No group name";
  }

  const { tags } = await account.devices.info(subgroup_id);
  const group_id = tags.find((tag) => tag.key === "group_id").value;

  const group_dev = await Utils.getDevice(account, group_id);

  if (new_subgroup_name) {
    const [subgroup_data] = await group_dev.getData({ variables: "subgroup_id", groups: subgroup_id, qty: 1 });
    const [subgroup_data_settings] = await config_dev.getData({ variables: "subgroup_id", groups: group_id, qty: 1 });

    await group_dev.editData({ id: subgroup_data.id, metadata: { ...subgroup_data.metadata, label: new_subgroup_name } });
    await config_dev.editData({ id: subgroup_data_settings.id, metadata: { ...subgroup_data_settings.metadata, label: new_subgroup_name } });

    // await group_dev.ed
  }

  return console.log("Subgroup edited!");
};
