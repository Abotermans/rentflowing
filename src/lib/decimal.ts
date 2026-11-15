import DecimalModule, { type Decimal as DecimalType } from "decimal.js-light";

export const Decimal = DecimalModule as unknown as typeof DecimalType;
export type Decimal = DecimalType;
