import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { PhilipsTV, PhilipsTVConfig } from 'philips-tv-api';
import { PhilipsTelevisionPlatform } from './platform';

export class PhilipsTVPlatformAccessory {
    private tvService: Service;
    private speakerService: Service;
    private ambihueService: Service;
    private tv: PhilipsTV;
    private name: string;
    private readonly keyMap: Map<CharacteristicValue, string>;

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

        const enablePlaypauseRebind = accessory.context.device.enablePlaypauseRebind || false;
        const playpauseRebind = accessory.context.device.playpauseRebind || undefined;
        const playpause = (enablePlaypauseRebind && playpauseRebind) ? playpauseRebind : 'PlayPause';
        this.keyMap = new Map<CharacteristicValue, string>([
            [platform.Characteristic.RemoteKey.REWIND, 'Rewind'],
            [platform.Characteristic.RemoteKey.FAST_FORWARD, 'FastForward'],
            [platform.Characteristic.RemoteKey.NEXT_TRACK, 'Next'],
            [platform.Characteristic.RemoteKey.PREVIOUS_TRACK, 'Previous'],
            [platform.Characteristic.RemoteKey.ARROW_UP, 'CursorUp'],
            [platform.Characteristic.RemoteKey.ARROW_DOWN, 'CursorDown'],
            [platform.Characteristic.RemoteKey.ARROW_LEFT, 'CursorLeft'],
            [platform.Characteristic.RemoteKey.ARROW_RIGHT, 'CursorRight'],
            [platform.Characteristic.RemoteKey.SELECT, 'Confirm'],
            [platform.Characteristic.RemoteKey.BACK, 'Back'],
            [platform.Characteristic.RemoteKey.EXIT, 'Back'],
            [platform.Characteristic.RemoteKey.PLAY_PAUSE, playpause],
            [platform.Characteristic.RemoteKey.INFORMATION, 'Home'],
            [platform.Characteristic.VolumeSelector.INCREMENT, 'VolumeUp'],
            [platform.Characteristic.VolumeSelector.DECREMENT, 'VolumeDown'],
        ]);

        this.tvService = accessory.getService(this.platform.Service.Television) ||
            accessory.addService(this.platform.Service.Television, accessory.context.device.name);

        this.speakerService = accessory.getService(this.platform.Service.TelevisionSpeaker) ||
            accessory.addService(this.platform.Service.TelevisionSpeaker, `${this.name} Speaker`);

        this.ambihueService = accessory.getService(this.platform.Service.Switch) ||
            accessory.addService(this.platform.Service.Switch, accessory.context.device.ambihueName);

        this.setupAccessory(accessory);
        this.refreshStatus();
        setInterval(() => {
            this.refreshStatus();
        }, accessory.context.device.refreshInterval);
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
        this.platform.log.debug(`[${this.name}] Refreshing status now`);
        try {
            const powerResponse = await this.tv.getPowerState();

            this.responsive = true;

            if (powerResponse.powerstate === 'On') {
                if (!this.power) {
                    this.platform.log.info(`[${this.name}] TV turned on`);
                    this.power = true;
                    this.tvService.updateCharacteristic(this.platform.Characteristic.Active, Number(this.power));
                }
            } else {
                if (this.power) {
                    this.platform.log.info(`[${this.name}] TV turned off`);
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

            this.platform.log.debug(`[${this.name}] Err:`, err);
        }

        if (!this.responsive) {
            return;
        }

        // Small delay to prevent socket hang up error
        await new Promise(resolve => setTimeout(resolve, 20));

        try {
            this.platform.log.debug(`[${this.name}] Fetching ambihue state now`);
            const ambihueResponse = await this.tv.getAmbilightPlusHueState();
            if (this.ambihueState !== ambihueResponse) {
                this.ambihueState = ambihueResponse;
                this.platform.log.info(`[${this.name}] Ambihue state changed:`, this.ambihueState);
                this.ambihueService.updateCharacteristic(this.platform.Characteristic.On, Number(this.ambihueState));
            }
        } catch (err) {
            this.platform.log.debug(`[${this.name}] Err:`, err);
        }
    }

    async setActive(value: CharacteristicValue) {
        this.platform.log.debug(`[${this.name}] setActive(${value})`);

        if (value as boolean) {
            if (!this.power) {
                this.platform.log.info(`[${this.name}] Sending WoL packet`);
                await this.tv.wakeOnLan();
                this.power = value as boolean;
            }
        } else {
            if (this.power) {
                this.platform.log.info(`[${this.name}] Turning off TV: powerstate =`, value as boolean);
                this.platform.log.warn(`[${this.name}] This function is currently disabled.`);
                // try {
                //     await this.tv.setPowerState(value as boolean);
                //     this.power = value as boolean;
                // } catch (err) {
                //     this.platform.log.error(`[${this.name}] Error during setPowerState:`, err);
                // }

            }
        }
    }

    async getActive(): Promise<CharacteristicValue> {
        const isOn = Number(this.power);
        this.platform.log.debug(`[${this.name}] getActive -> ${isOn}`);
        return isOn;
    }

    async remoteKey(value: CharacteristicValue) {
        this.platform.log.debug(`[${this.name}] remoteKey(${value})`);
        let key: string;
        if (this.keyMap.has(value)) {
            key = this.keyMap.get(value) as string;
            if (this.power) {
                this.platform.log.debug(`[${this.name}] Sending key`, key);
                try {
                    await this.tv.sendKey(key);
                } catch (err) {
                    this.platform.log.error(`[${this.name}] Error after sendKey:`, err);
                }
            } else {
                this.platform.log.debug(`[${this.name}] Tried to send key ${key} while TV is off`);
            }
        } else {
            this.platform.log.error(`[${this.name}] Unsupported key:`, value);
        }
    }


    async volumeButton(value: CharacteristicValue) {
        this.platform.log.debug(`[${this.name}] volumeButton(${value})`);
        await this.remoteKey(value);
    }

    async getMute(): Promise<boolean> {
        this.platform.log.debug(`[${this.name}] getMute -> ${this.muted}`);
        return this.muted;
    }

    async setMute(value: CharacteristicValue) {
        this.platform.log.debug(`[${this.name}] setMute(${value})`);
        try {
            await this.tv.setMute(value as boolean);
            this.muted = value as boolean;
        } catch (err) {
            this.platform.log.error(`[${this.name}] Error during setMute:`, err);
        }
    }

    async getAmbihueOn(): Promise<boolean> {
        this.platform.log.debug(`[${this.name}] getAmbihueOn -> ${this.ambihueState}`);
        return this.ambihueState;
    }

    async setAmbihueOn(value: CharacteristicValue) {
        this.platform.log.debug(`[${this.name}] setAmbihueOn(${value})`);
        if (this.power) {
            try {
                await this.tv.setAmbilightPlusHueState(value as boolean);
                this.platform.log.info(`[${this.name}] Set ambihue to`, value);
                this.ambihueState = value as boolean;
            } catch (err) {
                this.platform.log.error(`[${this.name}] Error during setAmbihueOn:`, err);
            }
        } else {
            // If the TV is turned off, flip the toggle back after 50 ms
            this.platform.log.info(`[${this.name}] Attempted to toggle ambihue while tv off, updating to`, this.ambihueState);
            setTimeout(() => {
                this.ambihueService.updateCharacteristic(this.platform.Characteristic.On, Number(this.ambihueState));
            }, 50);
        }
    }

}