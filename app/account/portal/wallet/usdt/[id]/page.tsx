import Content from "../../../../wallet/usdt/[id]/WalletUsdtContent";
import { portalCustomer } from "@/lib/business-portal-data";
export const dynamic="force-dynamic";
export default async function Page(props:{params:Promise<{id:string}>}){await portalCustomer();return <Content {...props} portal/>;}
