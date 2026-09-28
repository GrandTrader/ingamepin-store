import Page from "../../business/page";
import { portalCustomer } from "@/lib/business-portal-data";
export const dynamic="force-dynamic";
export default async function PortalPage(props: Parameters<typeof Page>[0]) {await portalCustomer();return <Page {...props}/>;}
