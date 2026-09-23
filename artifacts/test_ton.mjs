import { Cell } from "@ton/ton";

const boc = "te6ccgEBAQEABgAACAAAAAA=";
const cell = Cell.fromBase64(boc);
console.log("BOC hash:", cell.hash().toString("hex"));
