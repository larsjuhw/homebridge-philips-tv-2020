import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { PhilipsTV, PhilipsTVConfig } from 'philips-tv-api';
import { PhilipsTelevisionPlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class PhilipsTVPlatformAccessory {
    private tvService: Service;
    private speakerService: Service;
    private ambihueService: Service;
    private tv: PhilipsTV;
    private name: string;

    private power = false;
    private muted = false;
    private ambihueState = false;

    private responsive = false;

    constructor(
        private readonly platform: PhilipsTelevisionPlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        this.name = accessory.context.device.name;
        const config: PhilipsTVConfig = {
            apiVersion: 6,
            wakeUntilAPIReadyCounter: 10,
            broadcastIP: '255.255.255.255',
            wakeOnLanRequests: 1,
            wakeOnLanTimeout: 1000,
            apiType: 'Jointspace',
        };
        this.tv = new PhilipsTV(accessory.context.device.ip, accessory.context.device.mac, undefined, config);

        this.tvService = accessory.getService(this.platform.Service.Television) ||
            accessory.addService(this.platform.Service.Television, accessory.context.device.name);

        this.speakerService = accessory.getService(this.platform.Service.TelevisionSpeaker) ||
            accessory.addService(this.platform.Service.TelevisionSpeaker, `${this.name} Speaker`);

        this.ambihueService = accessory.getService(this.platform.Service.Lightbulb) ||
            accessory.addService(this.platform.Service.Lightbulb, `${this.name} Ambilight + Hue`);

        this.setupAccessory(accessory);
        setInterval(() => {
            this.refreshStatus();
        }, 15000);
    }

    async setupAccessory(accessory: PlatformAccessory) {
        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Philips')
            .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.model || 'Default-Model')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.serial || 'Default-Serial');

        this.tvService
            .setCharacteristic(this.platform.Characteristic.Name, this.name)
            .setCharacteristic(this.platform.Characteristic.ConfiguredName, this.name)
            .setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode,
                this.platform.Characteristic.SleepDiscoveryMode.NOT_DISCOVERABLE);

        this.tvService.getCharacteristic(this.platform.Characteristic.Active)
            .onSet(this.setActive.bind(this))
            .onGet(this.getActive.bind(this));

        this.tvService.getCharacteristic(this.platform.Characteristic.RemoteKey)
            .onSet(this.remoteKey.bind(this));

        this.speakerService
            .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
            .setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.ABSOLUTE);

        this.speakerService.getCharacteristic(this.platform.Characteristic.VolumeSelector)
            .onSet(this.volumeButton.bind(this));

        this.speakerService.getCharacteristic(this.platform.Characteristic.Mute)
            .onSet(this.setMute.bind(this))
            .onGet(this.getMute.bind(this));

        this.ambihueService.getCharacteristic(this.platform.Characteristic.On)
            .onSet(this.setAmbihueOn.bind(this))
            .onGet(this.getAmbihueOn.bind(this));

    }

    async refreshStatus() {
        this.platform.log.debug('Refreshing status now');
        try {
            const powerResponse = await this.tv.getPowerState();

            this.responsive = true;

            if (powerResponse.powerstate === 'On') {
                if (!this.power) {
                    this.platform.log.info('TV turned on');
                    this.power = true;
                    this.tvService.updateCharacteristic(this.platform.Characteristic.Active, Number(this.power));
                }
            } else {
                if (this.power) {
                    this.platform.log.info('TV turned off');
                    this.power = false;
                    this.tvService.updateCharacteristic(this.platform.Characteristic.Active, Number(this.power));
                }
            }
        } catch (err) {
            if (this.responsive) {
                this.platform.log.debug(`[${this.name}] Stopped responding`);
                this.responsive = false;
                this.power = false;
            }

            this.platform.log.debug('Err:', err);
            return;
        }

        // Small delay to prevent socket hang up error
        await new Promise(resolve => setTimeout(resolve, 20));

        try {
            this.platform.log.debug('Fetching the volume now');
            const volumeResponse = await this.tv.getVolume();
            if (this.muted !== volumeResponse.muted) {
                this.muted = volumeResponse.muted;
                this.platform.log.info('Mute state changed:', this.muted);
                this.speakerService.updateCharacteristic(this.platform.Characteristic.Mute, this.muted);
            }
        } catch (err) {
            this.platform.log.debug('Err:', err);
        }

        // Small delay to prevent socket hang up error
        await new Promise(resolve => setTimeout(resolve, 20));

        try {
            this.platform.log.debug('Fetching ambihue state now');
            const ambihueResponse = await this.tv.getAmbilightPlusHueState();
            if (this.ambihueState !== ambihueResponse) {
                this.ambihueState = ambihueResponse;
                this.platform.log.info('Ambihue state changed:', this.ambihueState);
                this.ambihueService.updateCharacteristic(this.platform.Characteristic.On, this.ambihueState);
            }
        } catch (err) {
            this.platform.log.debug('Err:', err);
        }
    }

    /**
     * Handle "SET" requests from HomeKit
     */
    async setActive(value: CharacteristicValue) {
        this.platform.log.debug(`[${this.name}] Set Characteristic On ->`, value);

        if (value as boolean) {
            this.platform.log.debug(`[${this.name}] Sending WoL packet`);
            await this.tv.wakeOnLan();
        } else {
            this.platform.log.debug(`[${this.name}] Setting powerstate`, value as boolean);
            await this.tv.setPowerState(value as boolean);
        }
    }

    /**
     * Handle the "GET" requests from HomeKit
     * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
     *
     * GET requests should return as fast as possbile. A long delay here will result in
     * HomeKit being unresponsive and a bad user experience in general.
     *
     * If your device takes time to respond you should update the status of your device
     * asynchronously instead using the `updateCharacteristic` method instead.
     * @example
     * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
     */
    async getActive(): Promise<CharacteristicValue> {
        const isOn = Number(this.power);
        this.platform.log.debug(`[${this.name}] Get Characteristic On ->`, Number(isOn));

        return isOn;
    }

    async remoteKey(value: CharacteristicValue) {
        const keyMap = new Map<CharacteristicValue, string>([
            [this.platform.Characteristic.RemoteKey.REWIND, 'Rewind'],
            [this.platform.Characteristic.RemoteKey.FAST_FORWARD, 'FastForward'],
            [this.platform.Characteristic.RemoteKey.NEXT_TRACK, 'Next'],
            [this.platform.Characteristic.RemoteKey.PREVIOUS_TRACK, 'Previous'],
            [this.platform.Characteristic.RemoteKey.ARROW_UP, 'CursorUp'],
            [this.platform.Characteristic.RemoteKey.ARROW_DOWN, 'CursorDown'],
            [this.platform.Characteristic.RemoteKey.ARROW_LEFT, 'CursorLeft'],
            [this.platform.Characteristic.RemoteKey.ARROW_RIGHT, 'CursorRight'],
            [this.platform.Characteristic.RemoteKey.SELECT, 'Confirm'],
            [this.platform.Characteristic.RemoteKey.BACK, 'Back'],
            [this.platform.Characteristic.RemoteKey.EXIT, 'Back'],
            [this.platform.Characteristic.RemoteKey.PLAY_PAUSE, 'PlayPause'],
            [this.platform.Characteristic.RemoteKey.INFORMATION, 'Home'],
            [this.platform.Characteristic.VolumeSelector.INCREMENT, 'VolumeUp'],
            [this.platform.Characteristic.VolumeSelector.DECREMENT, 'VolumeDown'],
        ]);

        let key: string;
        if (keyMap.has(value)) {
            key = keyMap.get(value) as string;
            this.platform.log.debug('Sending key', key);
            try {
                await this.tv.sendKey(key);
            } catch (err) {
                this.platform.log.error('Error after sendKey:', err);
            }
        } else {
            this.platform.log.error('Unsupported key:', value);
        }
    }


    async volumeButton(value: CharacteristicValue) {
        await this.remoteKey(value);
    }

    async getMute(): Promise<boolean> {
        return this.muted;
    }

    async setMute(value: CharacteristicValue) {
        try {
            await this.tv.setMute(value as boolean);
        } catch (err) {
            this.platform.log.error('Error during setMute:', err);
        }
    }

    async getAmbihueOn(): Promise<boolean> {
        return this.ambihueState;
    }

    async setAmbihueOn(value: CharacteristicValue) {
        this.platform.log.info('Set ambihue to', value);
        this.tv.setAmbilightPlusHueState(value as boolean);
        this.ambihueState = value as boolean;
    }

}