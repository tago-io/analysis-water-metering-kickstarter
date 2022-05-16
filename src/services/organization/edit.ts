import { Utils } from "@tago-io/sdk";
import { RouterConstructorDevice } from "../../types";

export default async ({ config_dev, context, scope, account, environment }: RouterConstructorDevice) => {
  const org_id = (scope[0] as any).device;
  const org_dev = await Utils.getDevice(account, org_id);

  const org_params = await account.devices.paramList(org_id);

  const org_auth_token_param = org_params.find((x) => x.key === "org_auth_token");
  const new_org_name = (scope[0] as any)["name"];
  const new_org_address = (scope[0] as any)["param.org_address"];

  if (new_org_name) {
    const [org_id_data] = await config_dev.getData({ variables: "org_id", groups: org_id, qty: 1 });
    await config_dev.deleteData({ variables: "org_id", groups: org_id });
    await config_dev.sendData({ ...org_id_data, metadata: { ...org_id_data.metadata, label: new_org_name } });
    await account.devices.edit(org_id, { name: new_org_name as string });
  }
  if (new_org_address) {
    const [org_id_data] = await config_dev.getData({ variables: "org_id", groups: org_id, qty: 1 });
    await config_dev.deleteData({ variables: "org_id", groups: "org_id" });
    await config_dev.sendData({ ...org_id_data, location: new_org_address.value });
    await account.dashboards.edit("623b5bc910781e001248c36b", {});
  }

  if (org_auth_token_param) {
    const [org_auth_token] = await config_dev.getData({ variables: "org_auth_token", qty: 1, groups: org_id });
    if (org_auth_token?.value) {
      await account.ServiceAuthorization.tokenEdit(org_auth_token.value as string, org_auth_token_param.value as string);
    }
  }

  return console.log("edited!");
};
