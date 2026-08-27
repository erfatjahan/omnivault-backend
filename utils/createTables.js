import { createUserTable } from "../models/usertable.js";
import { createOrderItemTable } from "../models/orderitemstable.js";
import { createOrdersTable } from "../models/orderstable.js";
import { createPaymentsTable } from "../models/paymentstable.js";
import { createProductReviewsTable } from "../models/productreviewstable.js";
import { createProductsTable } from "../models/producttable.js";
import { createShippingInfoTable } from "../models/shippingtable.js";
export const createTables = async () => {
  try {
    await createUserTable();
    await createProductsTable();
    await createProductReviewsTable();
    await createOrdersTable();
    await createOrderItemTable();
    await createShippingInfoTable();
    await createPaymentsTable();
    console.log("All Tables Created Successfully.");
  } catch (error) {
    console.error("Error creating tables:", error);
  }
};