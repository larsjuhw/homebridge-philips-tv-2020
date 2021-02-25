var request = require("request");
var wol = require("wake_on_lan");

const PLUGIN_NAME = 'homebridge-philips-tv-2020';
const PLATFORM_NAME = 'HomebridgePhilipsTV';

module.exports = (api) => {
    api.registerPlatform(PLATFORM_NAME, PhilipsTelevisionPlugin);
}

class PhilipsTelevisionPlugin {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;

        var that = this;

        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        // get the name
        const tvName = this.config.name;
        const tvIP = this.config.ip;
        const mac_address = this.config.mac_address;
        const baseURL = "http://" + tvIP + ":1925/6/";
        const ambilightStyles = this.config.ambilight_styles || [];

        this.log.info("Found " + ambilightStyles.length + " ambilight styles");

        // Generate a UUID
        const uuid = this.api.hap.uuid.generate('homebridge:my-tv-plugin' + tvName);

        // Create platform accessory
        this.tvAccessory = new api.platformAccessory(tvName, uuid);
        this.tvAccessory.category = this.api.hap.Categories.TELEVISION;

        // Add TV service to platform
        const tvService = this.tvAccessory.addService(this.Service.Television);
        tvService.setCharacteristic(this.Characteristic.ConfiguredName, tvName);
        tvService.setCharacteristic(this.Characteristic.SleepDiscoveryMode, this.Characteristic.SleepDiscoveryMode.NOT_DISCOVERABLE);

        // Add handlers for on/off events
        tvService.getCharacteristic(this.Characteristic.Active)
            .on('set', (newValue, callback) => {

                if (newValue == 1) {
                    that.log.info("TV turned on");

                    // Turn on TV using WOL
                    var wol_wake = function () {
                        wol.wake(mac_address, function (error) {
                            if (error) {
                                that.log.error("WOL failed: %s", error);
                            }
                        })
                    }
                    
                    wol_wake();
                } else {
                    that.log.info("TV turned off");

                    // Turn off TV using Standby key POST request
                    this.remoteButton("Standby");
                }

                tvService.updateCharacteristic(this.Characteristic.Active, 1);
                callback(null);
            })
            .on('get', (callback) => {
                // GET request to /6/powerstate to find current state
                // if no response, .get() returns false
                var state = 0;
                that.get("powerstate", (result) => {

                    if (result == false) {
                        state = 0;
                    } else {
                        var response = JSON.parse(result);
                        state = response.powerstate == "On" ? 1 : 0;
                    }

                    that.log.debug("Got powerstate: " + state);

                    callback(null, state);
                });
            });

        // Set default source (ambilight style) identifier to 1
        tvService.setCharacteristic(this.Characteristic.ActiveIdentifier, 1);

        // Handle source (ambilight style) changes
        tvService.getCharacteristic(this.Characteristic.ActiveIdentifier)
            .on('set', (newValue, callback) => {
                // The identifiers start at 1 while the array with styles starts at index 0,
                // so subtract 1 from the new value.
                const i = newValue - 1;

                this.log.debug('set Ambilight Active Identifier => setNewValue: ' + newValue);
                this.log.debug("set ambilight configuration to " + ambilightStyles[i].name);

                this.setAmbilight(ambilightStyles[i]);

                callback(null);
            });

        // Handle TV remote inputs
        tvService.getCharacteristic(this.Characteristic.RemoteKey)
            .on('set', (newValue, callback) => {
                switch (newValue) {
                    case this.Characteristic.RemoteKey.REWIND: {
                        this.log.debug('set Remote Key Pressed: REWIND');
                        this.remoteButton("Rewind");
                        break;
                    }
                    case this.Characteristic.RemoteKey.FAST_FORWARD: {
                        this.log.debug('set Remote Key Pressed: FAST_FORWARD');
                        this.remoteButton("FastForward");
                        break;
                    }
                    case this.Characteristic.RemoteKey.NEXT_TRACK: {
                        this.log.debug('set Remote Key Pressed: NEXT_TRACK');
                        this.remoteButton("Next");
                        break;
                    }
                    case this.Characteristic.RemoteKey.PREVIOUS_TRACK: {
                        this.log.debug('set Remote Key Pressed: PREVIOUS_TRACK');
                        this.remoteButton("Previous");
                        break;
                    }
                    case this.Characteristic.RemoteKey.ARROW_UP: {
                        this.log.debug('set Remote Key Pressed: ARROW_UP');
                        this.remoteButton("CursorUp");
                        break;
                    }
                    case this.Characteristic.RemoteKey.ARROW_DOWN: {
                        this.log.debug('set Remote Key Pressed: ARROW_DOWN');
                        this.remoteButton("CursorDown");
                        break;
                    }
                    case this.Characteristic.RemoteKey.ARROW_LEFT: {
                        this.log.debug('set Remote Key Pressed: ARROW_LEFT');
                        this.remoteButton("CursorLeft");
                        break;
                    }
                    case this.Characteristic.RemoteKey.ARROW_RIGHT: {
                        this.log.debug('set Remote Key Pressed: ARROW_RIGHT');
                        this.remoteButton("CursorRight");
                        break;
                    }
                    case this.Characteristic.RemoteKey.SELECT: {
                        this.log.debug('set Remote Key Pressed: SELECT');
                        this.remoteButton("Confirm");
                        break;
                    }
                    case this.Characteristic.RemoteKey.BACK: {
                        this.log.debug('set Remote Key Pressed: BACK');
                        this.remoteButton("Back");
                        break;
                    }
                    case this.Characteristic.RemoteKey.EXIT: {
                        this.log.debug('set Remote Key Pressed: EXIT');
                        this.remoteButton("Back");
                        break;
                    }
                    case this.Characteristic.RemoteKey.PLAY_PAUSE: {
                        this.log.debug('set Remote Key Pressed: PLAY_PAUSE');
                        this.remoteButton("AmbilightOnOff");
                        break;
                    }
                    case this.Characteristic.RemoteKey.INFORMATION: {
                        this.log.debug  ('set Remote Key Pressed: INFORMATION');
                        this.remoteButton("Home");
                        break;
                    }
                }

                callback(null);
            });

        /**
         * Create a speaker service to allow volume control
         */

        const speakerService = this.tvAccessory.addService(this.Service.TelevisionSpeaker);

        speakerService
            .setCharacteristic(this.Characteristic.Active, this.Characteristic.Active.ACTIVE)
            .setCharacteristic(this.Characteristic.VolumeControlType, this.Characteristic.VolumeControlType.ABSOLUTE);

        // Handle volume changes
        speakerService.getCharacteristic(this.Characteristic.VolumeSelector)
            .on('set', (newValue, callback) => {
                this.log.debug('set VolumeSelector => setNewValue: ' + newValue);

                if (newValue == 0) {
                    // Volume up
                    that.log.debug("Sending VolumeUp key");
                    this.remoteButton("VolumeUp");
                } else if (newValue == 1) {
                    // Volume down
                    that.log.debug("Sending VolumeDown key");
                    this.remoteButton("VolumeDown");
                } else {
                    // Unknown?
                    that.log.error("ERROR: UNKNOWN VOLUMESELECTOR VALUE (" + newValue + ")");
                }

                callback(null);
            });

        speakerService.getCharacteristic(this.Characteristic.Mute)
            .on('set', (newValue, callback) => {
                this.log.debug("Speakers new value: " + newValue);
                var muted = newValue == 1;
                var body = {
                    "muted": muted
                };

                this.post("audio/volume", body);

                callback(null);
            })
            .on('get', (callback) => {
                var mute = 0;
                callback(null, mute);
            });

        /**
         * Create TV Input Source Services to use as ambilight styles
         * These are the inputs the user can select from.
         * When a user selected an input the corresponding Identifier Characteristic
         * is sent to the TV Service ActiveIdentifier Characteristic handler.
         */
        
        var identifier = 0;
        ambilightStyles.forEach((item) => {
            const ambilightStyleService = this.tvAccessory.addService(this.Service.InputSource, item.value, item.name);
            ambilightStyleService
                .setCharacteristic(this.Characteristic.Identifier, ++identifier)
                .setCharacteristic(this.Characteristic.ConfiguredName, item.name)
                .setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED)
                .setCharacteristic(this.Characteristic.InputSourceType, this.Characteristic.InputSourceType.HDMI);

            tvService.addLinkedService(ambilightStyleService);
        });

        // Publish as external accessory as only one TV can be registered per bridge.
        
        this.api.publishExternalAccessories(PLUGIN_NAME, [this.tvAccessory]);

        this.remoteButton = function (button) {
            var body = {
                "key": button
            };
            this.post("input/key", body);
        }

        this.setAmbilight = function (style) {

            var body = {
                "styleName": style.type,
                "isExpert": false,
            };
            if ('str' in style) {
                body['stringValue'] = style.str;
            } else {
                body['menuSetting'] = style.value;
            }
            this.post("ambilight/currentconfiguration", body);
        }

        this.post = function (endpoint, body) {
            const url = baseURL + endpoint;

            var options = {
                body: JSON.stringify(body),
                rejectUnauthorized: false,
                timeout: 2000,
                forever: true,
                followAllRedirects: true
            };

            request.post(url, options, function (err, response, body) {
                if (!err && response.statusCode == 200) {
                    // Success
                    return body;
                } else if (response) {
                    const code = response.statusCode || "?";
                    that.log.error("Error (" + code + ") during POST request to " + url);
                    return false;
                }
            })
        }

        this.get = function (endpoint, callback) {
            const url = baseURL + endpoint;

            var options = {
                rejectUnauthorized: false,
                timeout: 750,
                forever: true,
                followAllRedirects: true
            };

            request.get(url, options, (err, response, body) => {
                if (!err && response.statusCode == 200) {
                    // Success
                    callback(body);
                } else {
                    that.log.error("Error during GET request (code %s)", response)
                    callback(false);
                }
            })
        }
    }
}