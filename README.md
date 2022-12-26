# Homebridge-philips-tv-2020

A Homebridge plugin to control your Philips TV. Made for the 43PUS7805 2020 model, but it should work for some other Jointspace, non-Android TV, version 6 API TVs.

Uses API version 6 and port 1925.

To check if your TV is compatible:

1. Turn the TV off completely
2. Unplug the tv and plug in again
3. Turn the TV on
4. Try visiting <http://[[YOUR-TV-IP-ADDRESS]]:1925/6/powerstate>

If you see a JSON response about the powerstate of the TV, it is likely compatible. 

The reason that the TV has to be unplugged is that for some reason there is a maximum amount of sockets that the TV allows, and it seems like old sockets are not deleted from its memory. This plugin keeps the socket alive so there should be no problems.

## Features

* Turn your TV on and off using HomeKit
* Basic TV remote controls on your device
* Change volume of TV on your device
* Toggle Ambilight + Hue from HomeKit

![styles-preview](https://user-images.githubusercontent.com/39745476/105191104-00d1a400-5b37-11eb-9975-24625c92f669.png)
![controls-preview](https://user-images.githubusercontent.com/39745476/105191429-5908a600-5b37-11eb-8eb9-9b8ce4079aff.png)

## Remote

To use the remote functionality, add the "Apple TV Remote" button to your control centre and open it. Your TV should be available in the list. The cursor and back buttons work as expected, but the Play-Pause button is currently configured to act as the ambilight button on your remote, and the Info button simulates the Home button.

While you are in the remote menu, you can use the volume buttons of your device to adjust the volume of your TV (or the speaker connected to it with HDMI ARC).

## Installation

### Installing the plugin

This plugin is not published on npm. To install it from GitHub, make sure you have git installed and run:

```shell
npm install -g git+https://github.com/larsjuhw/homebridge-philips-tv-2020.git
```

### Adding the accessory to HomeKit

HomeKit currently only allows one bridge to add one Television accessory. Therefore,this plugin is configured as a separate accessory and you need to manually add it to HomeKit.
1. Open the Home <img src='https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png' height='16.42px'> app on your device.
2. Tap the Home tab, then tap <img src='https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png' height='16.42px'>.
3. Tap **Add Accessory**, and select **I Don't Have a Code or Cannot Scan**.
4. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs.

### Config

#### Required parameters

| Name        | Type    | Description                                                                                        |
|-------------|---------|----------------------------------------------------------------------------------------------------|
| name        | string  | The name of your TV in HomeKit                                                                     |
| ip          | string  | The IP address of your TV                                                                          |
| mac_address | string  | The MAC Address of your TV which is used to turn on the TV with WoL                                |
| ambihue     | boolean | Whether the Play/Pause button should be replace by an Ambilight + Hue toggle                       |

#### Optional parameters
* ambilight_styles - List of Ambilight style objects. See [Ambilight styles](#ambilight-styles) for more information.

#### Example config

```json
{
    "platform": "HomebridgePhilipsTV",
    "name": "Philips TV",
    "ip": "192.168.2.110",
    "mac_address": "51:AC:47:4A:0A:8B",
    "ambihue": false,
    "ambilight_styles": [
        {
            "name": "Standard",
            "value": "STANDARD",
            "type": "FOLLOW_VIDEO"
        }
    ]
}
```

See [Ambilight styles](#ambilight-styles) for an example array of styles.

### Ambilight styles

Adding the ambilight_styles parameter to your config will allow you to change between ambilight styles using a source selector in the Home app.

![styles-preview](https://user-images.githubusercontent.com/39745476/105191104-00d1a400-5b37-11eb-9975-24625c92f669.png)

Example ambilight object:
```json
{
    "name": "Standard",
    "value": "STANDARD",
    "type": "FOLLOW_VIDEO"
}
```

You can find the `value` and `type` parameter of the current ambilight style with a GET request to `tvip:1925/6/ambilight/currentconfiguration`. The returned `menuSetting` is the `value` in the ambilight object, and the returned `styleName` is the `type` parameter. Some styles do not work when using their menuSetting in the POST request to change style, in that case you can add the optional `str` parameter to the ambilight object and use the `stringValue` of the style.

To (somewhat) find out which menuSettings your TV supports, you can `GET tvip:1925/6/ambilight/supportedstyles` and it will return a list of the three styleNames with their possible menuSetting values. However, this list will most likely contain many duplicates and styles that are not actually supported.

#### Example styles

```json
[
    {
        "name": "Standard",
        "value": "STANDARD",
        "type": "FOLLOW_VIDEO"
    },
    {
        "name": "Natural",
        "value": "NATURAL",
        "type": "FOLLOW_VIDEO"
    },
    {
        "name": "Sports",
        "value": "SPORTS",
        "type": "FOLLOW_VIDEO"
    },
    {
        "name": "Vivid",
        "value": "VIVID",
        "type": "FOLLOW_VIDEO"
    },
    {
        "name": "Game",
        "value": "GAME",
        "type": "FOLLOW_VIDEO"
    },
    {
        "name": "Lumina",
        "value": "ENERGY_ADAPTIVE_BRIGHTNESS",
        "type": "FOLLOW_AUDIO"
    },
    {
        "name": "Retro",
        "value": "VU_METER",
        "type": "FOLLOW_AUDIO",
        "str": "Retro"
    },
    {
        "name": "Rhythm",
        "value": "RANDOM_PIXEL_FLASH",
        "type": "FOLLOW_AUDIO"
    },
    {
        "name": "Hot Lava",
        "value": "HOT_LAVA",
        "type": "FOLLOW_COLOR"
    },
    {
        "name": "Deep Water",
        "value": "DEEP_WATER",
        "type": "FOLLOW_COLOR"
    },
    {
        "name": "Fresh Nature",
        "value": "FRESH_NATURE",
        "type": "FOLLOW_COLOR"
    },
    {
        "name": "Warm White",
        "value": "ISF",
        "type": "FOLLOW_COLOR"
    }
]
```