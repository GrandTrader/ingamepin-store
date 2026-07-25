import Link from "next/link";

type AdminOrderLinkProps = {
  orderId: string;
  orderNumber: string;
  className?: string;
};

export default function AdminOrderLink({
  orderId,
  orderNumber,
  className = "",
}: AdminOrderLinkProps) {
  const destination = `/admin/orders?order=${encodeURIComponent(
    orderId,
  )}#order-${encodeURIComponent(orderId)}`;

  return (
    <Link
      href={destination}
      className={`font-bold text-blue-600 hover:text-blue-500 hover:underline ${className}`}
    >
      {orderNumber}
    </Link>
  );
}