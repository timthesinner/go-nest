# Hive
Interface to the nest controller that brings humidity up front on the faceplate.  The service additionally monitors the outside air temperature and ensures that the internal humidity is set at a level that will not cause condensation on windows and walls.  This service requires both a nest thermostat and nest credentials.

![Image of Hive](https://github.com/timthesinner/hive/blob/master/images/hive.png)

## Getting Started
1. Run `go get github.com/timthesinner/hive/...`
1. create ~/.hive/creds.json
1. Run `hive.exe`
1. navigate to localhost:8080

## creds.json
```json
{
  "email":"EMAIL_USED_TO_LOGIN_TO_NEST",
  "password":"PASSWORD_USED_TO_LOGIN_TO_NEST"
}
```

## Advanced: Installing hive as a service on a RaspberryPI
These steps assume that you have a RaspberryPI already configured with a base OS (tested with ArchLinux) 

1. Clone this repository
1. Compile for Linux and Arm `env GOOS=linux GOARCH=arm go build -v`
1. Copy hive to the `/usr/bin` folder on your PI
1. Copy `hive.service` to `/etc/systemd/system` folder
1. Run `systemctl enable hive.service` to configure hive to start on boot
1. Run `systemctl start hive.service` to start hive immediatley
1. Monitor output using `journalctl -f -u hive.service`

**NOTE:** You may need to open port 8080, setup a creds file, or modify the hive.service definition.
