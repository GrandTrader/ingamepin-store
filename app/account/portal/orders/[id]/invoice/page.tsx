import Content from "@/app/account/orders/OrderInvoice";
import {portalCustomer} from "@/lib/business-portal-data";
export const dynamic="force-dynamic";
export default async function Page(props: {params:Promise<{id:string}>;searchParams:Promise<{itemId?:string}>}) {await portalCustomer();return <Content {...props} portal/>;}
