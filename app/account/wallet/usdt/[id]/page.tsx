import Content from "./WalletUsdtContent";
export const dynamic="force-dynamic";
export default function Page(props:{params:Promise<{id:string}>}){return <Content {...props}/>;}
