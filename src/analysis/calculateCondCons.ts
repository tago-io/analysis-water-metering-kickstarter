import { Account, Analysis, Utils } from "@tago-io/sdk";
import { Data, TagoContext } from "@tago-io/sdk/lib/types";

import { fetchDeviceList } from "../lib/fetchDeviceList";

async function condCons(context: TagoContext, scope: Data[]): Promise<void> {
  context.log("Running Analysis");

  const environment = Utils.envToJson(context.environment);
  if (!environment) {
    throw "Missing environment variables";
  }

  if (!environment.account_token) {
    throw "Missing account_token environment var";
  }

  const account = new Account({ token: environment.account_token });

  const org_list = await fetchDeviceList(account, [{ key: "device_type", value: "organization" }]);

  org_list.map(async (org) => {
    const org_dev = await Utils.getDevice(account, org.id);

    const cons_data = await org_dev.getData({ variables: "current_cons", qty: 9999 }); // current_cons generated in calculateCurrentCons.ts
    // if (!cons_data || !cons_data.length) {
    //   return;
    // }

    console.log(cons_data);

    const total_cond_cons = cons_data.reduce((prev, curr) => prev + Number(curr.value), 0);

    await org_dev.deleteData({ variables: "total_cond_cons", skip: 1 });
    await org_dev.sendData({ variable: "total_cond_cons", value: total_cond_cons, unit: "m³" });
  });
}

async function startAnalysis(context: TagoContext, scope: any) {
  try {
    await condCons(context, scope);
    context.log("Analysis finished");
  } catch (error) {
    console.log(error);
    context.log(error.message || JSON.stringify(error));
  }
}

export default new Analysis(startAnalysis, { token: "baa870b0-6b81-4c22-8712-5d4ca1960389" });
