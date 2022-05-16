import { RouterConstructor } from "@tago-io/sdk/out/modules/Utils/router/router";
import { fetchDeviceList } from "../../lib/fetchDeviceList";
import sendNotificationError from "../../lib/notificationError";

export default async ({ config_dev, context, scope, account, environment }: RouterConstructor) => {
  //id of the org device
  const org_id = (scope[0] as any).device;
  const org_info = await account.devices.info(org_id);

  const params = await account.devices.paramList(org_id);

  const org_auth_token = params.find((x) => x.key === "org_auth_token");
  //deleting token
  // const [org_auth_token] = await config_dev.getData({ variables: "org_auth_token", qty: 1, groups: org_id });
  if (org_auth_token?.value) {
    await account.ServiceAuthorization.tokenDelete(org_auth_token.value as string);
  }

  //delete from settings_device
  const [org_id_data] = await config_dev.getData({ variables: "org_id", groups: org_id, qty: 1 });
  await config_dev.deleteData({ groups: org_id, qty: 99999 });

  await account.actions.delete(org_id_data?.metadata?.action_id).catch((msg) => console.log(msg));

  //deleting users (organization's user)
  const user_accounts = await account.run.listUsers({ filter: { tags: [{ key: "organization_id", value: org_id }] } });
  if (user_accounts) {
    user_accounts.forEach((user) => {
      account.run.userDelete(user.id);
      config_dev.deleteData({ groups: user.id, qty: 9999 });
    });
  }

  //deleting organization's device

  const devices = await fetchDeviceList(account, [{ key: "organization_id", value: org_id }]);

  if (devices) {
    devices.forEach((x) => {
      account.devices.delete(x.id); /*passing the device id*/
    });
  }

  return await sendNotificationError(account, environment, `Condominium ${org_info.name} successfuly deleted!`, "Condominium deleted");
};
