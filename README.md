# hive
Interface to the nest controller that brings humidity up front on the faceplate.  The service additionally monitors the outside air temperature and ensures that the internal humidity is set at a level that will not cause condensation on windows and walls.  This service requires both a nest thermostat and nest credentials.

![Image of Hive](https://github.com/timthesinner/hive/blob/master/images/hive.png)

## Getting Started
* go get github.com/timthesinner/hive/...
* create ~/.hive/creds.json
* run hive.exe
* navigate to localhost:8080

## creds.json
```json
{
  "email":"EMAIL_USED_TO_LOGIN_TO_NEST",
  "password":"PASSWORD_USED_TO_LOGIN_TO_NEST"
}
```
