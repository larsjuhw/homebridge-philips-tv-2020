import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLUGIN_NAME } from './settings';
import { PhilipsTVPlatformAccessory } from './PhilipsTVAccessory';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class PhilipsTelevisionPlatform implements DynamicPlatformPlugin {
    public readonly Service: typeof Service = this.api.hap.Service;
    public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

    // this is used to track restored cached accessories
    public readonly accessories: PlatformAccessory[] = [];

    constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
    ) {
        this.log.debug('Finished initializing platform:', this.config.name);

        this.api.on('didFinishLaunching', () => {
            log.debug('Executed didFinishLaunching callback');
            this.discoverDevices();
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.log.info('Loading accessory from cache:', accessory.displayName);
        this.accessories.push(accessory);
    }

    discoverDevices() {
        // loop over the discovered devices and register each one if it has not already been registered
        for (const device of this.config.devices) {

            const uuid = this.api.hap.uuid.generate(device.mac);
            const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

            if (existingAccessory) {
                this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                new PhilipsTVPlatformAccessory(this, existingAccessory);
            } else {
                this.log.info('Adding new accessory:', device.name);

                const accessory = new this.api.platformAccessory(device.name, uuid);
                accessory.category = this.api.hap.Categories.TELEVISION;
                accessory.context.device = device;

                new PhilipsTVPlatformAccessory(this, accessory);

                this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
            }
        }
    }
}
