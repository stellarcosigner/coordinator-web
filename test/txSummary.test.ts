/**
 * Safety-critical tests for the XDR → plain-language decoder. A wrong summary
 * could mislead a signer into approving something they didn't intend, so these
 * exercise the decoder against real transactions built with @stellar/stellar-sdk.
 */
import { describe, expect, it } from 'vitest';
import {
  Account,
  Asset,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  decodeEnvelope,
  describeTransaction,
  InvalidTransactionError,
  parseEnvelope,
} from '../src/lib/txSummary';

const source = Keypair.random();
const sourceAccount = source.publicKey();
const destination = Keypair.random().publicKey();
const TESTNET = Networks.TESTNET;

function buildPaymentXdr(): string {
  const sourceAccountInstance = new Account(sourceAccount, '1234567890');
  const transaction = new TransactionBuilder(sourceAccountInstance, {
    fee: '100',
    networkPassphrase: TESTNET,
  })
    .addOperation(Operation.payment({ destination, asset: Asset.native(), amount: '10.5' }))
    .setTimeout(300)
    .build();
  return transaction.toXDR();
}

describe('decodeEnvelope', () => {
  it('decodes a native payment into a plain-language sentence', () => {
    const summary = decodeEnvelope(buildPaymentXdr(), 'testnet');

    expect(summary.source).toBe(sourceAccount);
    expect(summary.fee).toBe('100');
    expect(summary.operations).toHaveLength(1);
    const payment = summary.operations[0];
    expect(payment.type).toBe('payment');
    // The amount is normalized to 7 decimals by the SDK ('10.5000000').
    expect(payment.description).toMatch(/^Pay \d+\.\d+ XLM to G/);
    expect(payment.description).toContain(destination);
    expect(payment.details.destination).toBe(destination);
    expect(payment.details.asset).toBe('XLM');
  });

  it('describes every operation in a multi-operation transaction', () => {
    const transaction = new TransactionBuilder(new Account(sourceAccount, '1234567890'), {
      fee: '100',
      networkPassphrase: TESTNET,
      memo: Memo.text('coordinator fixture'),
    })
      .addOperation(Operation.payment({ destination, asset: Asset.native(), amount: '10' }))
      .addOperation(Operation.createAccount({ destination, startingBalance: '1' }))
      .addOperation(Operation.manageData({ name: 'demo', value: Buffer.from('hello', 'utf8') }))
      .setTimeout(300)
      .build();

    const summary = describeTransaction(transaction);

    expect(summary.memo).toEqual({ type: 'text', value: 'coordinator fixture' });
    expect(summary.operations).toHaveLength(3);

    expect(summary.operations[0].description).toMatch(/^Pay /);
    expect(summary.operations[1].description).toMatch(/^Create account G.*starting balance 1\.0* XLM$/);
    expect(summary.operations[2].description).toBe('Set data entry demo = "hello"');
    expect(summary.timeBounds).not.toBeNull();
    expect(summary.signaturesAttachedToEnvelope).toBe(0);
  });

  it('describes a setOptions operation that changes the account multisig', () => {
    const signerToAdd = Keypair.random().publicKey();
    const transaction = new TransactionBuilder(new Account(sourceAccount, '1234567890'), {
      fee: '100',
      networkPassphrase: TESTNET,
    })
      .addOperation(
        Operation.setOptions({
          signer: { ed25519PublicKey: signerToAdd, weight: 1 },
          medThreshold: 2,
        }),
      )
      .setTimeout(300)
      .build();

    const summary = describeTransaction(transaction);

    expect(summary.operations[0].description).toContain('medium threshold 2');
    expect(summary.operations[0].description).toContain(signerToAdd);
  });

  it('reports signatures already attached to the envelope', () => {
    const transaction = new TransactionBuilder(new Account(sourceAccount, '1234567890'), {
      fee: '100',
      networkPassphrase: TESTNET,
    })
      .addOperation(Operation.payment({ destination, asset: Asset.native(), amount: '1' }))
      .setTimeout(300)
      .build();
    transaction.sign(source);

    const summary = describeTransaction(transaction);
    expect(summary.signaturesAttachedToEnvelope).toBe(1);
  });

  it('rejects junk that is not an envelope XDR', () => {
    expect(() => decodeEnvelope('this is not xdr', 'testnet')).toThrow(
      InvalidTransactionError,
    );
  });

  it('parses an envelope under either network (XDR carries no passphrase)', () => {
    // The network passphrase is only used for hashing, never embedded in the
    // envelope, so parsing cannot reveal the intended network. This is why the
    // app surfaces the network selector and Freighter's own network warning.
    const xdr = buildPaymentXdr();
    expect(() => parseEnvelope(xdr, 'testnet')).not.toThrow();
    expect(() => parseEnvelope(xdr, 'mainnet')).not.toThrow();
  });

  it('rejects fee-bump envelopes', () => {
    const inner = new TransactionBuilder(new Account(sourceAccount, '1234567890'), {
      fee: '100',
      networkPassphrase: TESTNET,
    })
      .addOperation(Operation.payment({ destination, asset: Asset.native(), amount: '1' }))
      .setTimeout(300)
      .build();
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      Keypair.random().publicKey(),
      '200',
      inner,
      TESTNET,
    );
    expect(() => parseEnvelope(feeBump.toXDR(), 'testnet')).toThrow(
      InvalidTransactionError,
    );
  });
});
