import { NearBindgen, initialize, call, near, view } from "near-sdk-js";
import { AccountId } from "near-sdk-js/lib/types";

@NearBindgen({})
class BOSCommerce {
  hello_account: AccountId = "";

  @initialize({})
  init({ hello_account }: { hello_account: AccountId }) {
    this.hello_account = hello_account;
  }

  @call({})
  query_greeting(): void {
    near.log("query_greeting");
  }

  @view({})
  view_greeting(): void {
    near.log("view_greeting");
  }
}
