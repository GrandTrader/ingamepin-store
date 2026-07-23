export type CategoryProductOption = {
  id: number;
  denomination: number;
  sellingPrice: number;
  stock: number;
};

export type ProductCategory = {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  delivery: string;
  icon: string;
  options: CategoryProductOption[];

  allowCustomAmount?: boolean;
  customAmountMin?: number;
  customAmountMax?: number;
  customAmountMaxQuantity?: number;
};

export const productCategories: ProductCategory[] = [
  {
    slug: "playstation-gift-cards",
    name: "PlayStation Store Gift Cards India",
    shortName: "PlayStation",
    description:
      "Select your required PlayStation gift card denomination and quantity.",
    delivery:
      "The gift card code will be delivered automatically to the recipient email after successful payment.",
    icon: "🎮",
    options: [
      {
        id: 1,
        denomination: 1000,
        sellingPrice: 1000,
        stock: 120,
      },
      {
        id: 2,
        denomination: 2000,
        sellingPrice: 2000,
        stock: 75,
      },
      {
        id: 3,
        denomination: 3000,
        sellingPrice: 3000,
        stock: 40,
      },
      {
        id: 4,
        denomination: 4000,
        sellingPrice: 4000,
        stock: 25,
      },
      {
        id: 5,
        denomination: 5000,
        sellingPrice: 5000,
        stock: 18,
      },
    ],
  },

  {
    slug: "steam-wallet-cards",
    name: "Steam Wallet Gift Cards India",
    shortName: "Steam",
    description:
      "Select your required Steam Wallet gift card denomination and quantity.",
    delivery:
      "The gift card code will be delivered automatically to the recipient email after successful payment.",
    icon: "💻",
    options: [
      {
        id: 1,
        denomination: 150,
        sellingPrice: 150,
        stock: 100,
      },
      {
        id: 2,
        denomination: 250,
        sellingPrice: 250,
        stock: 80,
      },
      {
        id: 3,
        denomination: 500,
        sellingPrice: 500,
        stock: 60,
      },
      {
        id: 4,
        denomination: 1000,
        sellingPrice: 1000,
        stock: 40,
      },
      {
        id: 5,
        denomination: 2500,
        sellingPrice: 2500,
        stock: 20,
      },
      {
        id: 6,
        denomination: 5000,
        sellingPrice: 5000,
        stock: 10,
      },
    ],
  },

  {
    slug: "apple-gift-cards",
    name: "Apple App Store & iTunes Gift Card India",
    shortName: "Apple Gift Cards",
    description:
      "Select a fixed gift amount or enter any amount between ₹100 and ₹10,000.",
    delivery:
      "The Apple Gift Card code will be delivered automatically to the recipient email after successful payment.",
    icon: "🍎",

    allowCustomAmount: true,
    customAmountMin: 100,
    customAmountMax: 10000,
    customAmountMaxQuantity: 10,

    options: [
      {
        id: 1,
        denomination: 100,
        sellingPrice: 100,
        stock: 150,
      },
      {
        id: 2,
        denomination: 500,
        sellingPrice: 500,
        stock: 100,
      },
      {
        id: 3,
        denomination: 1000,
        sellingPrice: 1000,
        stock: 80,
      },
      {
        id: 4,
        denomination: 1500,
        sellingPrice: 1500,
        stock: 60,
      },
      {
        id: 5,
        denomination: 2000,
        sellingPrice: 2000,
        stock: 50,
      },
      {
        id: 6,
        denomination: 2500,
        sellingPrice: 2500,
        stock: 40,
      },
      {
        id: 7,
        denomination: 3000,
        sellingPrice: 3000,
        stock: 35,
      },
      {
        id: 8,
        denomination: 5000,
        sellingPrice: 5000,
        stock: 25,
      },
      {
        id: 9,
        denomination: 7500,
        sellingPrice: 7500,
        stock: 15,
      },
      {
        id: 10,
        denomination: 10000,
        sellingPrice: 10000,
        stock: 10,
      },
    ],
  },
];