import { Account, Services, Utils } from "@tago-io/sdk";
import { Data, TagoContext, UserInfo } from "@tago-io/sdk/lib/types";

interface IMessageDetail {
  device_name: string;
  device_id: string;
  sensor_type: string;
  value: string;
  variable: string;
}

function replaceMessage(message: string, replace_details: IMessageDetail) {
  for (const key of Object.keys(replace_details)) {
    message = message.replace(new RegExp(`#${key}#`, "g"), (replace_details as any)[key]);
  }

  return message;
}

async function getUsers(account: Account, send_to: string[]) {
  const func_list = send_to.map((user_id) => account.run.userInfo(user_id).catch(() => null));

  return (await Promise.all(func_list)).filter((x) => x) as UserInfo[];
}

interface IAlertTrigger {
  action_id: string;
  data: Data;
  send_to: string[];
  type: string[];
  device: string;
}

async function sendAlert(account: Account, context: TagoContext, org_id: string, alert: IAlertTrigger) {
  const { data, action_id: alert_id, send_to, type } = alert;
  const groupWithAlert = await Utils.getDevice(account, alert.device);
  const org_dev = await Utils.getDevice(account, org_id);

  // Get action message
  const [message_var] = await groupWithAlert.getData({ variables: ["action_list_message", "action_group_message"], groups: alert_id, qty: 1 });

  const device_id = data.device;
  const device_info = await account.devices.info(device_id);

  const replace_details: IMessageDetail = {
    device_name: device_info?.name,
    device_id: device_info?.id,
    sensor_type: device_info?.tags?.find((tag) => tag.key === "sensor")?.value,
    value: String(data?.value),
    variable: data?.variable,
  };

  const message = replaceMessage(message_var.value as string, replace_details);

  const users_info = await getUsers(account, send_to);

  const to_dispatch_qty = users_info.length;

  if (type.includes("notification_run")) {
    users_info.forEach((user) => {
      account.run.notificationCreate(user.id, {
        message,
        title: "Alert Trigger",
      });
    });
  }

  if (type.includes("email")) {
    const email = new Services({ token: context.token }).email;

    email.send({
      to: users_info.map((x) => x.email).join(","),
      template: {
        name: "email_alert",
        params: {
          device_name: device_info.name,
          alert_message: message,
        },
      },
    });
  }

  if (type.includes("sms")) {
    users_info.forEach((user) => {
      const smsService = new Services({ token: context.token }).sms;
      smsService
        .send({
          message,
          to: user.phone,
        })
        .then((msg) => console.log(msg));
    });
  }
}

export { sendAlert, IAlertTrigger };
