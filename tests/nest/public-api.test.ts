import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import * as nest from '../../src/presentation/nest';

describe('nest subpath public API', () => {
  it('exports the modules, the factories, and the injection tokens', () => {
    expect(Object.keys(nest).sort()).toEqual([
      'SISP',
      'SISP_REFUND_AUTHORIZER',
      'SISP_STATUS_AUTHORIZER',
      'STATELESS_SISP',
      'SispModule',
      'StatelessSispModule',
      'createSispController',
      'createStatelessSispController',
    ]);
  });

  it('builds a distinct controller class per mount path', () => {
    const first = nest.createSispController('pay');
    const second = nest.createSispController('sisp');

    expect(first).not.toBe(second);
  });
});
