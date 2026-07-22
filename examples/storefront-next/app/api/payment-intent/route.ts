import { Tab } from "@runtab/sdk";

// Your secret key stays on the server. The intent signs the amount so the
// browser can never change the price.
const tab = new Tab(process.env.TAB_SECRET_KEY as string, {
  apiBaseUrl: process.env.TAB_API_BASE_URL ?? "https://app.runtab.xyz",
});

export async function GET(request: Request) {
  const { intent, intentToken } = await tab.paymentIntents.create({
    amount: "1.00",
    intentUrl: request.url,
  });
  return Response.json({ intent, intentToken });
}
