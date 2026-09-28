import Page from "../../security/page";
import { portalCustomer } from "@/lib/business-portal-data";
export const dynamic="force-dynamic";
export default async function PortalPage(){await portalCustomer();return <Page/>;}
