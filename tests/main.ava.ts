import { Worker, NEAR, NearAccount } from "near-workspaces";
import anyTest, { TestFn } from "ava";

const test = anyTest as TestFn<{
  worker: Worker;
  accounts: Record<string, NearAccount>;
}>;

test.beforeEach(async (t) => {
  const worker = await Worker.init();

  const root = worker.rootAccount;
  const contract = await root.devDeploy("../contract/build/contract.wasm", { args: {}, initialBalance: NEAR.parse("100 N").toJSON(), method: "init" });
  const alice = await root.createSubAccount("alice", { initialBalance: NEAR.parse("100 N").toJSON() });
  const bob = await root.createSubAccount("bob", { initialBalance: NEAR.parse("100 N").toJSON() });  

  t.context.worker = worker;
  t.context.accounts = { root, contract, alice, bob };
});

test.afterEach.always(async (t) => {
  await t.context.worker.tearDown().catch((error) => {
    console.log("Failed to tear down the worker:", error);
  });
});

test("create_item: happy path", async (t) => {
  const { contract, alice } = t.context.accounts;
  const result = await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: NEAR.parse("0.025 N").toJSON() });
  t.deepEqual(result, { success: true, msg: "Item created successfully", item_id: "0" });
  const items = await contract.view("get_items", {});
  t.deepEqual(items, [{ id: "0", name: "test", description: "test", image: "test", owner: alice.accountId, created_at: "0", updated_at: "0", status: "CREATED", price: "" }]);
});

test("create_item: missing fields", async (t) => {
  const { contract, alice } = t.context.accounts;
  const result = await alice.call(contract, "create_item", { name: "test" }, { attachedDeposit: NEAR.parse("0.01 N").toJSON() });
  t.deepEqual(result, { success: false, msg: "assertion failed: Description is required" });
  const items = await contract.view("get_items", {});
  t.deepEqual(items, []);
});

test("create_item: invalid fields", async (t) => {
  const { contract, alice } = t.context.accounts;
  const result = await alice.call(contract, "create_item", { name: 123, description: 12.12, image: new Uint8Array(100) }, { attachedDeposit: NEAR.parse("0.025 N").toJSON() });
  t.deepEqual(result, { success: false, msg: "assertion failed: Name must be a string" });
  const items = await contract.view("get_items", {});
  t.deepEqual(items, []);
});

test("create_item: missing deposit", async (t) => {
  const { contract, alice } = t.context.accounts;
  const result = await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" });
  t.deepEqual(result, { success: false, msg: "assertion failed: Not enough attached deposit. Minimum deposit is 25000000000000000000000 yoctoNEAR and you attached 0 yoctoNEAR." });
  const items = await contract.view("get_items", {});
  t.deepEqual(items, []);
});

test("create_item: max deposit", async (t) => {
  const { contract, alice } = t.context.accounts;

  const contractAvailableBeforeLarge = (await contract.balance()).available;

  const testDepositNEAR = NEAR.parse("0.1 N");
  const MAX_NAME_WORDS = 25;
  const MAX_DESC_WORDS = 2000;
  const MAX_IMAGE_WORDS = 200;

  const resultLarge = await alice.call(
    contract,
    "create_item",
    { name: "word ".repeat(MAX_NAME_WORDS), description: "word ".repeat(MAX_DESC_WORDS), image: "test".repeat(MAX_IMAGE_WORDS) },
    { attachedDeposit: testDepositNEAR.toJSON() }
  );
  t.deepEqual(resultLarge, { success: true, msg: "Item created successfully", item_id: "0" });

  const contractAvailableAfterLarge = (await contract.balance()).available;

  const usedDeposit = contractAvailableAfterLarge.sub(contractAvailableBeforeLarge).sub(testDepositNEAR).abs();
  t.log("Required NEAR for large object:", usedDeposit.toHuman());

  const testLowerBand = NEAR.parse("0.11 N");
  const testUpperBand = NEAR.parse("0.12 N");
  t.true(usedDeposit.gte(testLowerBand) && usedDeposit.lte(testUpperBand), "Used deposit is not in the expected range");
});

test("delete_item: happy path", async (t) => {
  const { contract, alice } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: NEAR.parse("0.025 N").toJSON() });
  const result = await alice.call(contract, "delete_item", { item_id: "0" });
  t.deepEqual(result, { success: true, msg: "Item deleted successfully" });
  const items = await contract.view("get_items", {});
  t.deepEqual(items, []);
});

test("delete_item: missing fields", async (t) => {
  const { contract, alice } = t.context.accounts;
  const result = await alice.call(contract, "delete_item", {});
  t.deepEqual(result, { success: false, msg: "assertion failed: Item ID is required" });
});

test("delete_item: invalid fields", async (t) => {
  const { contract, alice } = t.context.accounts;
  const result = await alice.call(contract, "delete_item", { item_id: 1.01 });
  t.deepEqual(result, { success: false, msg: "assertion failed: Item ID must be a string" });
});

test("delete_item: item does not exist", async (t) => {
  const { contract, alice } = t.context.accounts;
  const result = await alice.call(contract, "delete_item", { item_id: "0" });
  t.deepEqual(result, { success: false, msg: "assertion failed: Item does not exist" });
});

test("delete_item: not owner", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: NEAR.parse("0.025 N").toJSON() });
  const result = await bob.call(contract, "delete_item", { item_id: "0" });
  t.deepEqual(result, { success: false, msg: "assertion failed: Only the owner can delete an item" });
});

test("delete_item: item is listed", async (t) => {
  const { contract, alice } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: NEAR.parse("0.025 N").toJSON() });
  await alice.call(contract, "list_item", { item_id: "0", price: 0.1 });
  const result = await alice.call(contract, "delete_item", { item_id: "0" });
  t.deepEqual(result, { success: false, msg: "assertion failed: Item is listed for sale. Please delist it first" });
});

test("list_item: happy path", async (t) => {
  const { contract, alice } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: NEAR.parse("0.025 N").toJSON() });
  const result = await contract.view("get_items", {});
  t.deepEqual(result, [{ id: "0", name: "test", description: "test", image: "test", owner: alice.accountId, created_at: "0", updated_at: "0", status: "CREATED", price: "" }]);
  const resultListItem = await alice.call(contract, "list_item", { item_id: "0", price: 0.1 });
  t.deepEqual(resultListItem, { success: true, msg: "Item listed successfully" });
  const resultListed = await contract.view("get_items", {});
  t.deepEqual(resultListed, [{ id: "0", name: "test", description: "test", image: "test", owner: alice.accountId, created_at: "0", updated_at: "0", status: "FORSALE", price: "0.1" }]);
});

test("list_item: missing fields", async (t) => {
  const { contract, alice } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: NEAR.parse("0.025 N").toJSON() });
  const result = await contract.view("get_items", {});
  t.deepEqual(result, [{ id: "0", name: "test", description: "test", image: "test", owner: alice.accountId, created_at: "0", updated_at: "0", status: "CREATED", price: "" }]);

  const resultListItem = await alice.call(contract, "list_item", {});
  t.deepEqual(resultListItem, { success: false, msg: "assertion failed: Item ID is required" });
});

test("list_item: invalid fields", async (t) => {
  const { contract, alice } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: NEAR.parse("0.025 N").toJSON() });
  const result = await contract.view("get_items", {});
  t.deepEqual(result, [{ id: "0", name: "test", description: "test", image: "test", owner: alice.accountId, created_at: "0", updated_at: "0", status: "CREATED", price: "" }]);

  const resultListItem = await alice.call(contract, "list_item", { item_id: 1.01, price: "test" });
  t.deepEqual(resultListItem, { success: false, msg: "assertion failed: Item ID must be a string" });
});

test("list_item: item does not exist", async (t) => {
  const { contract, alice } = t.context.accounts;
  const resultListItem = await alice.call(contract, "list_item", { item_id: "0", price: 0.1 });
  t.deepEqual(resultListItem, { success: false, msg: "assertion failed: Item does not exist" });
});

test("list_item: not owner", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: NEAR.parse("0.025 N").toJSON() });
  const resultListItem = await bob.call(contract, "list_item", { item_id: "0", price: 0.1 });
  t.deepEqual(resultListItem, { success: false, msg: "assertion failed: Only the owner can list an item" });
});

test("list_item: item is already listed", async (t) => {
  const { contract, alice } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: NEAR.parse("0.025 N").toJSON() });;
  await alice.call(contract, "list_item", { item_id: "0", price: 0.1 });
  const resultListItem = await alice.call(contract, "list_item", { item_id: "0", price: 0.1 });
  t.deepEqual(resultListItem, { success: false, msg: "assertion failed: Item is already listed" });
});

test("delist_item: happy path", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: "0.025 N" });
  await alice.call(contract, "list_item", { item_id: "0", price: 0.1 });
  const result = await alice.call(contract, "delist_item", { item_id: "0" });
  t.deepEqual(result, { success: true, msg: "Item delisted successfully" });
  const items = await contract.view("get_items", {});
  t.deepEqual(items, [{ id: "0", name: "test", description: "test", image: "test", owner: alice.accountId, created_at: "0", updated_at: "0", status: "CREATED", price: "" }]);
});

test("delist_item: missing fields", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  const result = await alice.call(contract, "delist_item", {});
  t.deepEqual(result, { success: false, msg: "assertion failed: Item ID is required" });
});

test("delist_item: invalid fields", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  const result = await alice.call(contract, "delist_item", { item_id: 1.01 });
  t.deepEqual(result, { success: false, msg: "assertion failed: Item ID must be a string" });
});

test("delist_item: item does not exist", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  const result = await alice.call(contract, "delist_item", { item_id: "0" });
  t.deepEqual(result, { success: false, msg: "assertion failed: Item does not exist" });
});

test("delist_item: not owner", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: "0.025 N" });
  await alice.call(contract, "list_item", { item_id: "0", price: 0.1 });
  const result = await bob.call(contract, "delist_item", { item_id: "0" });
  t.deepEqual(result, { success: false, msg: "assertion failed: Only the owner can delist an item" });
});

test("delist_item: item is not listed", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: "0.025 N" });
  const result = await alice.call(contract, "delist_item", { item_id: "0" });
  t.deepEqual(result, { success: false, msg: "assertion failed: Item is not listed for sale" });
});

test("purchase_item: happy path", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: "0.025 N" });
  await alice.call(contract, "list_item", { item_id: "0", price: 0.1 });
  const bobBalanceBefore = (await bob.balance()).total;
  const result = await bob.call(contract, "purchase_item", { item_id: "0" }, { attachedDeposit: "0.1 N" });
  t.deepEqual(result, { success: true, msg: "Item purchased successfully" });
  const bobBalanceAfter = (await bob.balance()).total;
  t.true(bobBalanceBefore.sub(bobBalanceAfter).toBigInt() > BigInt("1" + "0".repeat(23)) && bobBalanceBefore.sub(bobBalanceAfter).toBigInt() < BigInt("11" + "0".repeat(22)), "Bob's balance did not decrease by the expected amount");
  const items = await contract.view("get_items", {});
  t.deepEqual(items, [{ id: "0", name: "test", description: "test", image: "test", owner: bob.accountId, created_at: "0", updated_at: "0", status: "SOLD", price: "" }]);
});

test("purchase_item: missing fields", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  const result = await bob.call(contract, "purchase_item", {}, { attachedDeposit: "0.1 N" });
  t.deepEqual(result, { success: false, msg: "assertion failed: Item ID is required" });
});

test("purchase_item: invalid fields", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  const result = await bob.call(contract, "purchase_item", { item_id: 1.01 }, { attachedDeposit: "0.1 N" });
  t.deepEqual(result, { success: false, msg: "assertion failed: Item ID must be a string" });
});

test("purchase_item: item does not exist", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  const result = await bob.call(contract, "purchase_item", { item_id: "0" }, { attachedDeposit: "0.1 N" });
  t.deepEqual(result, { success: false, msg: "assertion failed: Item does not exist" });
});

test("purchase_item: not listed", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: "0.025 N" });
  const result = await bob.call(contract, "purchase_item", { item_id: "0" }, { attachedDeposit: "0.1 N" });
  t.deepEqual(result, { success: false, msg: "assertion failed: Item is not listed for sale" });
});

test("purchase_item: not enough deposit", async (t) => {
  const { contract, alice, bob } = t.context.accounts;
  await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: "0.025 N" });
  await alice.call(contract, "list_item", { item_id: "0", price: 0.1 });
  const result = await bob.call(contract, "purchase_item", { item_id: "0" }, { attachedDeposit: "0.01 N" });
  t.deepEqual(result, { success: false, msg: "assertion failed: Not enough attached deposit. Minimum deposit is 100000000000000000000000 yoctoNEAR and you attached 10000000000000000000000 yoctoNEAR." });
});
