import Page from "../../../wallet/topup-return/page";
import { portalCustomer } from "@/lib/business-portal-data";
export const dynamic="force-dynamic";
export default async function PortalReturn(){await portalCustomer();return <Page/>;}
