import { Worker, NEAR, NearAccount } from "near-workspaces";
import anyTest, { TestFn } from "ava";

const test = anyTest as TestFn<{
  worker: Worker;
  accounts: Record<string, NearAccount>;
}>;

test.beforeEach(async (t) => {
  const worker = await Worker.init();

  const root = worker.rootAccount;
  const contract = await root.devDeploy("../contract/build/contract.wasm", { args: {}, initialBalance: NEAR.parse("10 N").toJSON(), method: "init" });
  const alice = await root.createSubAccount("alice", { initialBalance: NEAR.parse("10 N").toJSON() });

  t.context.worker = worker;
  t.context.accounts = { root, contract, alice };
});

test.afterEach.always(async (t) => {
  await t.context.worker.tearDown().catch((error) => {
    console.log("Failed to tear down the worker:", error);
  });
});

test("create_item: happy path", async (t) => {
  const { contract, alice } = t.context.accounts;
  const result = await alice.call(contract, "create_item", { name: "test", description: "test", image: "test" }, { attachedDeposit: NEAR.parse("0.01 N").toJSON() });
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

// TODO
// test create item with invalid fields
// test create item with invalid owner
// test default storage fee
