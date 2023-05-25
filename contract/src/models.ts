
export enum ItemStatus {
  CREATED = "CREATED",
  FORSALE = "FORSALE",
  DELETED = "DELETED",
  SOLD = "SOLD"
}
export class Item {
  id: string = "";
  name: string = "";
  description: string = "";
  price: string = "";
  image: string = "";
  owner: string = "";
  created_at: string = "";
  updated_at: string = "";
  status: ItemStatus = ItemStatus.CREATED;
}
