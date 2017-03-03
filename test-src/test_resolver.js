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

  beforeEach(() => {
    resolver.service = 'AMAZON';
    resolver.__processFile();
  });

  it('should have both ipv4 and ipv6 prefixs', () => {
    assert(resolver.__ipv4Prefixes.length > 1);
    assert(resolver.__ipv6Prefixes.length > 1);
  });

  for (let ip of ['104.16.40.2', '2400:cb00:2048:1::6810:2902']) {
    it('should throw for non-AWS IP: ' + ip, done => {
      try {
        resolver.lookup('104.16.40.2');
        done(new Error('shouldnt run')); 
      } catch (err) {
        assert(/IP is not in AMAZON/.test(err.message));
        done();
      }
    });
  }

  for (let ip of ['54.213.70.216', '2600:1f14::1']) {
    it(ip + ' should be an AMAZON resource in us-west-2', () => {
      let actual = resolver.lookup(ip);
      assert(actual.region === 'us-west-2');
      assert(actual.service === 'AMAZON');
    });

    it(ip + ' should be an EC2 resource in us-west-2', () => {
      resolver.service = 'EC2';
      resolver.__processFile();
      let actual = resolver.lookup(ip);
      assert(actual.region === 'us-west-2');
      assert(actual.service === 'EC2');
    });
    
    it(ip + 'should throw when service is wrong', done => {
      resolver.service = 'S3';
      resolver.__processFile();
      try {
        resolver.lookup(ip);
        done(new Error('shouldnt run')); 
      } catch (err) {
        assert(/IP is not in S3/.test(err.message));
        done();
      }
    });
  }

});
