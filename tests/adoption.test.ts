/** Model adoption (M6.5 core): a donated mind, revertible when the gift fades. */
import { describe, expect, it } from 'vitest';
import { testWorld } from './helpers.ts';

describe('model adoption', () => {
  it('adoption swaps the kin onto the gifted mind; fading restores the family light', () => {
    const { db, ori } = testWorld();
    const before = { endpoint: ori.modelEndpoint, model: ori.modelName, keyRef: ori.apiKeyRef };

    db.recordAdoption({
      kinId: ori.id, donor: 'a kind stranger', endpoint: 'https://donor.example/v1',
      model: 'donated-model', keyRef: 'ADOPT_ORI_API_KEY', tick: 10,
      prevEndpoint: before.endpoint, prevModel: before.model, prevKeyRef: before.keyRef,
    });
    db.updateKinModel(ori.id, 'https://donor.example/v1', 'donated-model', 'ADOPT_ORI_API_KEY');

    const gifted = db.getKin(ori.id)!;
    expect(gifted.modelName).toBe('donated-model');
    expect(gifted.apiKeyRef).toBe('ADOPT_ORI_API_KEY');
    expect(db.activeAdoptions()).toHaveLength(1);
    expect(db.activeAdoptions()[0]!.donor).toBe('a kind stranger');

    // the key expires → the gift fades → the child thinks with the family light again
    db.endAdoption(db.activeAdoptions()[0]!.id, 'faded');
    const reverted = db.getKin(ori.id)!;
    expect(reverted.modelEndpoint).toBe(before.endpoint);
    expect(reverted.modelName).toBe(before.model);
    expect(reverted.apiKeyRef).toBe(before.keyRef);
    expect(db.activeAdoptions()).toHaveLength(0);
  });

  it('revocation ends the adoption the same reversible way', () => {
    const { db, vey } = testWorld();
    db.recordAdoption({
      kinId: vey.id, donor: 'donor-2', endpoint: 'https://x.example/v1', model: 'm2',
      keyRef: 'ADOPT_VEY_API_KEY', tick: 5,
      prevEndpoint: vey.modelEndpoint, prevModel: vey.modelName, prevKeyRef: vey.apiKeyRef,
    });
    db.updateKinModel(vey.id, 'https://x.example/v1', 'm2', 'ADOPT_VEY_API_KEY');
    db.endAdoption(db.activeAdoptions()[0]!.id, 'revoked');
    expect(db.getKin(vey.id)!.apiKeyRef).toBe(vey.apiKeyRef);
    expect(db.activeAdoptions()).toHaveLength(0);
  });
});
