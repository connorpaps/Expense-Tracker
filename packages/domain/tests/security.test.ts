import { describe, expect, it } from 'vitest';
import {
  NodeDeviceKeyWrapper,
  NodeEnvelopeCipher,
  NodeSnapshotSigner,
  randomVaultKey,
} from './support/node-crypto';

describe('Security interface contracts (T012)', () => {
  it('encrypts and decrypts envelopes with AAD binding', async () => {
    const key = randomVaultKey();
    const cipher = new NodeEnvelopeCipher(key);
    const aad = new TextEncoder().encode('vault-1|transaction|tx-1');
    const plaintext = new TextEncoder().encode('{"amount_minor":-1234}');
    const envelope = await cipher.encrypt(plaintext, aad);
    expect(envelope.ciphertext.length).toBeGreaterThan(0);
    expect(envelope.nonce.length).toBeGreaterThan(0);
    expect(envelope.tag.length).toBeGreaterThan(0);

    const decrypted = await cipher.decrypt(envelope, aad);
    expect(new TextDecoder().decode(decrypted)).toBe('{"amount_minor":-1234}');
  });

  it('fails decryption when the AAD context is tampered', async () => {
    const key = randomVaultKey();
    const cipher = new NodeEnvelopeCipher(key);
    const aad = new TextEncoder().encode('vault-1');
    const envelope = await cipher.encrypt(new TextEncoder().encode('secret'), aad);
    await expect(cipher.decrypt(envelope, new TextEncoder().encode('vault-2'))).rejects.toThrow();
  });

  it('wraps a vault key for a paired device and unwraps it locally', async () => {
    const wrapper = new NodeDeviceKeyWrapper();
    const device = await wrapper.generateKeyPair();
    const vaultKey = randomVaultKey();

    const wrapped = await wrapper.wrapForDevice(device.publicKey, vaultKey);
    expect(wrapped.keyVersion).toBe(1);

    const unwrapped = await wrapper.unwrapFromDevice(device.privateKey, wrapped);
    expect(Buffer.from(unwrapped).equals(Buffer.from(vaultKey))).toBe(true);
  });

  it('rejects unwrapping with the wrong private key', async () => {
    const wrapper = new NodeDeviceKeyWrapper();
    const deviceA = await wrapper.generateKeyPair();
    const deviceB = await wrapper.generateKeyPair();
    const wrapped = await wrapper.wrapForDevice(deviceA.publicKey, randomVaultKey());
    await expect(wrapper.unwrapFromDevice(deviceB.privateKey, wrapped)).rejects.toThrow();
  });

  it('signs and verifies authenticated snapshots', async () => {
    const signer = new NodeSnapshotSigner();
    const keypair = await signer.generateKeyPair();
    const payload = new TextEncoder().encode('{"snapshot_checkpoint":{"device-a":42}}');
    const signature = await signer.sign(payload, keypair.privateKey);
    expect(signature.length).toBeGreaterThan(0);
    expect(await signer.verify(payload, keypair.publicKey, signature)).toBe(true);
    expect(await signer.verify(new TextEncoder().encode('tampered'), keypair.publicKey, signature)).toBe(false);
  });
});

