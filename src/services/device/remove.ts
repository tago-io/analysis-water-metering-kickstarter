import { Utils } from "@tago-io/sdk";
import sendNotificationError from "../../lib/notificationError";
import { RouterConstructorDevice } from "../../types";

export default async ({ config_dev, context, scope, account, environment }: RouterConstructorDevice) => {
  const dev_id = (scope[0] as any).device;
  const device_info = await (await Utils.getDevice(account, dev_id)).info();

  const group_id = device_info.tags.find((tag) => tag.key === "group_id")?.value;
  const org_id = device_info.tags.find((tag) => tag.key === "organization_id").value;

  const org_dev = await Utils.getDevice(account, org_id);
  await org_dev.deleteData({ groups: dev_id, qty: 9999 });

  const group_dev = await Utils.getDevice(account, group_id as string);
  await group_dev.deleteData({ groups: dev_id, qty: 9999 });

  await config_dev.deleteData({ groups: dev_id, qty: 99999 });

  await org_dev.deleteData({ variables: "current_cons", groups: dev_id, qty: 9999 });

  await account.devices.delete(dev_id);
  return await sendNotificationError(account, environment, `Meter ${device_info.name} successfuly deleted!`, "Meter deleted");
};
