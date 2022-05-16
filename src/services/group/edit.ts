import { Utils } from "@tago-io/sdk";
import { RouterConstructorDevice } from "../../types";

export default async ({ config_dev, context, scope, account, environment }: RouterConstructorDevice) => {
  const group_id = (scope[0] as any).device;
  const new_group_name = (scope[0] as any).name;
  const new_group_address = (scope[0] as any)["param.group_address"];

  if (!new_group_name) {
    return "No group name";
  }

  const { tags } = await account.devices.info(group_id);
  const org_id = tags.find((tag) => tag.key === "organization_id").value;

  const org_dev = await Utils.getDevice(account, org_id);

  if (new_group_name) {
    const [group_id_data] = await org_dev.getData({ variables: "group_id", groups: group_id, qty: 1 });
    const [group_id_data_settings] = await config_dev.getData({ variables: "group_id", groups: group_id, qty: 1 });

    await org_dev.editData({ id: group_id_data.id, metadata: { ...group_id_data.metadata, label: new_group_name } });
    await config_dev.editData({ id: group_id_data_settings.id, metadata: { ...group_id_data_settings.metadata, label: new_group_name } });
  }
  if (new_group_address) {
    const [group_id_data] = await org_dev.getData({ variables: "group_id", groups: group_id, qty: 1 });
    await org_dev.deleteData({ variables: "group_id", groups: group_id });
    await org_dev.sendData({ ...group_id_data, location: new_group_address.location });
  }

  return console.log("Group edited!");
};
