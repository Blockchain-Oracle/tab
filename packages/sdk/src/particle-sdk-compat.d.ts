// Compatibility declaration for @particle-network/universal-account-sdk@2.0.3.
// The published package ships dist/index.d.ts but omits a `types` condition from
// its exports map, so TypeScript's bundler resolver cannot reach those types.
declare module "@particle-network/universal-account-sdk" {
  export interface IAssetsResponse {
    assets: unknown[];
    totalAmountInUSD: number;
  }

  export interface ISmartAccountOptions {
    name: string;
    ownerAddress: string;
    smartAccountAddress?: string;
    solanaSmartAccountAddress?: string;
    useEIP7702?: boolean;
    version: string;
  }

  export interface IUniversalAccountConfig {
    projectAppUuid: string;
    projectClientKey: string;
    projectId: string;
    smartAccountOptions?: ISmartAccountOptions;
    tradeConfig?: { slippageBps?: number };
  }

  export interface IUserOpWithChain {
    chainId: number;
    eip7702Auth?: { address: string; chainId: number; nonce: number };
    eip7702Delegated?: boolean;
    userOp: { sender: string };
    userOpHash: string;
  }

  export interface ITransaction {
    receiver: string;
    rootHash: string;
    sender: string;
    smartAccountOptions: { ownerAddress: string; senderAddress: string };
    tag: string;
    userOps: IUserOpWithChain[];
  }

  export const UNIVERSAL_ACCOUNT_VERSION: "2.0.1";

  export class UniversalAccount {
    constructor(config: IUniversalAccountConfig);
    createTransferTransaction(input: {
      amount: string;
      receiver: string;
      token: { address: string; chainId: number };
    }): Promise<ITransaction>;
    getPrimaryAssets(): Promise<IAssetsResponse>;
    getSmartAccountOptions(): Promise<ISmartAccountOptions>;
    sendTransaction(
      transaction: ITransaction,
      signature: string,
      authorizations?: Array<{ signature: string; userOpHash: string }>,
    ): Promise<unknown>;
  }
}
