import { Device, Types, Utils } from "@tago-io/sdk";
import { DataToSend } from "@tago-io/sdk/out/modules/Device/device.types";
import validation from "../../lib/validation";
import registerUser from "../../lib/registerUser";
import { parseTagoObject } from "../../lib/data.logic";
import { RouterConstructorData } from "../../types";

interface UserData {
  name: string;
  email: string;
  phone?: string | number | boolean | void;
  timezone: string;
  tags?: Types.Common.TagsObj[];
  password?: string;
  id?: string;
}

function phoneNumberHandler(phone_number: string) {
  //US as default
  let country_code = "+1";
  let resulted_phone_number: string;

  if (phone_number.slice(0, 1).includes("+")) {
    country_code = phone_number.slice(0, 3);
    phone_number = phone_number.slice(3);
  }
  //removing special characters
  resulted_phone_number = phone_number.replace(/[^\w\s]/gi, "");

  resulted_phone_number = `${country_code}${resulted_phone_number}`;

  return resulted_phone_number;
}

//registered by admin account.

export default async ({ config_dev, context, scope, account, environment }: RouterConstructorData) => {
  const org_id = scope[0].device;
  const org_dev = await Utils.getDevice(account, org_id);

  //Collecting data
  const new_user_name = scope.find((x) => x.variable === "new_user_name");
  const new_user_email = scope.find((x) => x.variable === "new_user_email");
  const new_user_password = scope.find((x) => x.variable === "new_user_password");
  const new_user_access = scope.find((x) => x.variable === "new_user_access");
  const new_user_phone = scope.find((x) => x.variable === "new_user_phone");

  const new_user_org = scope.find((x) => x.variable === "new_user_org");
  const new_user_group = scope.find((x) => x.variable === "new_user_group");
  const new_user_subgroup = scope.find((x) => x.variable === "new_user_subgroup");

  //validation
  const validate = validation("user_validation", org_dev);

  if (!new_user_name.value) {
    throw validate("Name field is empty", "danger");
  }
  if ((new_user_name.value as string).length < 3) {
    throw validate("Name field is smaller than 3 character", "danger");
  }
  if (!new_user_email.value) {
    throw validate("Email field is empty", "danger");
  }
  if (!new_user_access.value) {
    throw validate("Access field is empty", "danger");
  }
  if (new_user_phone?.value) {
    new_user_phone.value = phoneNumberHandler(new_user_phone.value as string);
  }

  const [user_exists] = await account.run.listUsers({
    page: 1,
    amount: 1,
    filter: { email: new_user_email.value as string },
  });

  if (user_exists) {
    throw validate("#VAL.USER_ALREADY_EXISTS#", "danger");
  }

  // let user_tags: { key: string; value: string }[] = [];

  // if (new_user_access.value === "orgadmin") {
  //   const array_tags = new_user_org.metadata.sentValues.map((x) => {
  //     return { key: "organization_id", value: x.value as string };
  //   });

  //   user_tags = user_tags.concat(array_tags);
  // }
  //creating user
  const { timezone } = await account.info();

  const new_user_data: UserData = {
    name: new_user_name.value as string,
    email: (new_user_email.value as string).trim(),
    phone: (new_user_phone?.value as string) || "",
    password: new_user_password.value as string,
    timezone: timezone,
    tags: [
      {
        key: "access",
        value: new_user_access.value as string,
      },
    ],
  };

  if (new_user_access.value === "orgadmin") {
    new_user_data.tags = new_user_data.tags.concat(
      new_user_org.metadata.sentValues.map((x) => {
        return { key: "organization_id", value: x.value as string };
      })
    );
  } else if (new_user_access.value === "guest") {
    new_user_data.tags.push({ key: "user_org_id", value: new_user_org.value as string });
    new_user_data.tags.push({ key: "user_group_id", value: new_user_group.value as string });
    new_user_subgroup.metadata.sentValues.map((sentValue) => {
      new_user_data.tags.push({ key: "subgroup_id", value: sentValue.value as string });
    });
  }

  const { url: run_url } = await account.run.info();

  //registering user
  const new_user_id = await registerUser(context, account, new_user_data, run_url).catch((msg) => {
    throw validate(msg, "danger");
  });

  const user_data = {
    user_id: { value: new_user_id as string, metadata: { label: `${new_user_name.value} (${new_user_email.value})` } },
    user_name: new_user_name.value as string,
    user_email: new_user_email.value as string,
    user_phone: (new_user_phone?.value as string) || "",
    user_access: { value: new_user_access.value as string, metadata: { label: new_user_access.metadata.label } },
  };

  let user_org: DataToSend;
  let user_subgroup: DataToSend;

  if (new_user_access.value === "admin") {
    user_org = { variable: "user_org", value: "Full access", group: new_user_id };
    user_subgroup = { variable: "user_subgroup", value: "Full access", group: new_user_id };
  } else if (new_user_access.value === "orgadmin") {
    user_org = { ...new_user_org, variable: "user_org", group: new_user_id };
    user_subgroup = { variable: "user_subgroup", value: "All aparments related to the condominium", group: new_user_id };
  } else if (new_user_access.value === "guest") {
    user_org = { ...new_user_org, variable: "user_org", group: new_user_id };
    user_subgroup = { ...new_user_subgroup, variable: "user_subgroup", group: new_user_id };
  }

  // if (new_user_access.value === "admin") {
  //   user_data = user_data.concat([{ variable: "user_admin", value: new_user_id as string, group: new_user_id, metadata: { label: new_user_name.value as string } }]);
  // }

  // //sending to org device
  // org_dev.sendData(parseTagoObject(user_data));

  //sending to admin device (settings_device)
  await config_dev.sendData(parseTagoObject(user_data, new_user_id).concat([user_org, user_subgroup]));

  return validate("#VAL.USER_SUCCESSFULLY_INVITED_AN_EMAIL_WILL_BE_SENT_WITH_THE_CREDENTIALS_TO_THE_NEW_USER#", "success");
};
