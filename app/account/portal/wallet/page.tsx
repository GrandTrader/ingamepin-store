import Page from "../../wallet/WalletContent";
import { portalCustomer } from "@/lib/business-portal-data";
export const dynamic="force-dynamic";
export default async function PortalPage(props: Omit<Parameters<typeof Page>[0],"portal">) {await portalCustomer();return <Page {...props} portal/>;}
