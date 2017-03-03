import events from 'events';
import https from 'https';
import urllib from 'url';
import ipaddr from 'ipaddr.js';
import _debug from 'debug';
const debug = _debug('AWSRegionResolver');
debug('OHAI');

// http://docs.aws.amazon.com/general/latest/gr/aws-ip-ranges.html
// https://ip-ranges.amazonaws.com/ip-ranges.json
function ipFetcher (resource) {
  resource = resource || 'https://ip-ranges.amazonaws.com/ip-ranges.json';
  return async () => {
    return new Promise((resolve, reject) => {
      debug('going to request ' + resource);
      let request;

      try {
        request = https.request(urllib.parse(resource));
        request.end();
      } catch (err) {
        return reject(err);
      }

      request.on('error', reject);

      request.on('response', response => {
        if (response.statusCode < 200 || response.statusCode >=300) {
          reject(new Error('Expected 200 series response'));
        }
        let body = [];
        response.on('data', data => {
          try {
            debug('Received Data');
            body.push(data);
          } catch (err) {
            request.abort();
            reject(err);
          }
        });

        response.once('end', () => {
          try {
            debug('Got data!');
            resolve(JSON.parse(Buffer.concat(body)));
          } catch (err) {
            reject(err);
          }
        });


      });
    });
  }
}

class AWSRegionResolver extends events.EventEmitter {
  constructor(opts) {
    opts = opts || {};
    super();
    this.fetcher = opts.fetcher || ipFetcher();
    this.interval = opts.interval || 10 * 60 * 1000;
    this.service = opts.service ? opts.service.toUpperCase() : 'AMAZON';
    this.__keepGoing = false;
    this.__timeout = null;
    this.__ips = null;
    this.__ipPrefixes = null;
  }

  start() {
    this.emit('starting');
    this.__keepGoing = true;
    this.__scheduleUpdate();
    this.emit('started');
  }

  updateOnce() {
    this.__keepGoing = false;
    this.__scheduleUpdate();
  }

  stop() {
    this.emit('stopping');
    this.__keepGoing = false;
    if (this.__timeout) {
      clearTimeout(this.__timeout);
    }
    this.emit('stopped');
  }

  lookup(ip) {
    if (!this.__ips) {
      throw new Error('No IP Prefixes available yet');
    }
    let region;
    let service;
    let addr;

    /*
    {
      "ip_prefix": "13.32.0.0/15",
      "region": "GLOBAL",
      "service": "AMAZON"
    },
    {
      "ipv6_prefix": "2a05:d000:4000::/40",
      "region": "eu-central-1",
      "service": "EC2"
    },
    */
    try {
      addr = ipaddr.parse(ip);
    } catch (err) {
      throw new Error('IP Is not parsable');
    }

    let prefixList;
    if (addr.kind() === 'ipv4') {
      prefixList = this.__ipv4Prefixes;
    } else if (addr.kind() === 'ipv6') {
      prefixList = this.__ipv6Prefixes;
    } else {
      throw new Error('Unknown kind of IP Address');
    }
  
    for (let prefix of prefixList) {
      if (addr.match(prefix.prefix)) {
        return {
          service: prefix.service,
          region: prefix.region,
        };
      }
    }

    throw new Error('IP is not in ' + this.service);
  }

  __processFile() {
    this.__ipv4Prefixes = this.__ips.prefixes.filter(prefix => prefix.service === this.service)
    .map(prefix => {
      return {
        service: prefix.service,
        region: prefix.region,
        prefix: ipaddr.parseCIDR(prefix.ip_prefix),
    }});

    this.__ipv6Prefixes = this.__ips.ipv6_prefixes.filter(prefix => prefix.service === this.service)
      .map(prefix => {
      return {
        service: prefix.service,
        region: prefix.region,
        prefix: ipaddr.parseCIDR(prefix.ipv6_prefix),
    }});

    let summary = [
      `Processed ${this.__ips.prefixes.length} into `,
      `${this.__ipv4Prefixes.length} IPv4 ${this.service} prefixes and `,
      `${this.__ipv6Prefixes.length} IPv6 ${this.service} prefixes`,
    ].join('');

    debug(summary);
  }

  __scheduleUpdate(addDelay) {
    this.__timeout = setTimeout(async () => {
      try {
        debug('Starting IP Update');
        this.emit('starting-update'); 
        let newIps = await this.fetcher();
        debug('Got File');
        if (newIps !== this.__ips) {
          this.emit('new-ip-prefixes');
        }
        this.__ips = newIps;
        this.__processFile();
        this.emit('completed-update'); 
        if (this.__keepGoing) {
          this.__scheduleUpdate(true);
        }
        debug('Completed IP Update');
      } catch (err) {
        debug('Error Updating IPs: ' + err.stack || err);
        this.emit('error', err);
      }
    }, addDelay ? this.interval: 0);
  }

}


module.exports = {
  AWSRegionResolver,
  ipFetcher,
};
