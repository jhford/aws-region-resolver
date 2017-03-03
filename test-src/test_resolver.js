import {AWSRegionResolver} from '../lib/index';
import assert from 'assert';
import fs from 'fs';

describe('AWSRegionResolver', () => {
  let resolver = new AWSRegionResolver({
    fetcher: async function() {
      return new Promise((resolve, reject) => {
        try {
          resolve(JSON.parse(fs.readFileSync(__dirname + '/../ip-ranges.json')));
        } catch (err) {
          reject(err);
        }
      });
    }
  });

  before(done => {
    resolver.once('completed-update', done);
    resolver.updateOnce();
  });

  it('should have both ipv4 and ipv6 prefixs', () => {
    assert(resolver.__ipv4Prefixes.length > 1);
    assert(resolver.__ipv6Prefixes.length > 1);
  });

  it('should throw when IPv4 is not in AWS', () => {
    try {
      resolver.lookup('104.16.40.2');
    } catch (err) {
      console.dir(err);
      assert(/IP is not in AWS/.test(err.message));
    }
  });
  
  it('should throw when IP is not in AWS', () => {
    try {
      resolver.lookup('2400:cb00:2048:1::6810:2902');
    } catch (err) {
      assert(/IP is not in AWS/.test(err.message));
    }
  });

  it('should resolve IPv4 in EC2 correctly', () => {
    let actual = resolver.lookup('54.213.70.216');
    assert(actual.region === 'us-east-1');
    assert(actual.service === 'EC2');
  });

});
