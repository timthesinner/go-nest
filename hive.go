//Copyright (c) 2015 TimTheSinner All Rights Reserved.
package main

//DEBUG MODE FOR UI: go-bindata -debug -o ui.go ui/...
//go:generate go-bindata -o ui.go ui/...

/**
 * Copyright (c) 2015 TimTheSinner All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 *
 * @author TimTheSinner
 */

import (
	"bytes"
	"encoding/json"
	"fmt"
	"github.com/elazarl/go-bindata-assetfs"
	"io/ioutil"
	"net/http"
	"os"
	"os/user"
	"path"
	"regexp"
	"strconv"
	"time"
)

const HOST = "https://home.nest.com"
const LOGIN = HOST + "/user/login"
const user_agent = "Nest/1.1.0.10 CFNetwork/548.0.4"
const DESIRED_HUMIDITY = 40

type User struct {
	Userid        string `json:"userid"`
	Access_token  string `json:"access_token"`
	Transport_url string `json:"transport_url"`
	Weather_url   string `json:"weather_url"`
	Home          Home   `json:"home"`
}

func normalize_humidity(hum int) int {
	if hum < 10 {
		return 10
	}
	if hum > 60 {
		return 60
	}
	return hum - (hum % 5)
}

func (u User) setHumidity(deviceId string, hum int) (map[string]interface{}, error) {
	hum = normalize_humidity(hum)
	//fmt.Println("Setting humidity to", hum)
	return POST(map[string]interface{}{"target_humidity": hum}, u.Transport_url+"/v2/put/device."+deviceId, &u)
}

func (u User) setTemp(deviceId string, temp float64, units string) (map[string]interface{}, error) {
	//fmt.Println("Setting temp to", temp, units)
	temp = convert_to_celcius(temp, units)
	return POST(map[string]interface{}{"target_change_pending": true, "target_temperature": temp}, u.Transport_url+"/v2/put/shared."+deviceId, &u)
}

type Home struct {
	Inside  []Thermostat `json:"inside"`
	Outside Outside      `json:"outside"`
}

type Thermostat struct {
	Device        string   `json:"device"`
	Type          string   `json:"type"`
	Location      string   `json:"location"`
	Has_leaf      bool     `json:"has_leaf"`
	State         string   `json:"state"`
	Nest_metadata Nest     `json:"nest_metadata"`
	Humidity      Humidity `json:"humidity"`
	Hvac          HVAC     `json:"hvac"`
}

type Nest struct {
	Device map[string]interface{} `json:"device"`
	Shared map[string]interface{} `json:"shared"`
}

type Humidity struct {
	Has_humidifier     bool                   `json:"has_humidifier"`
	Humidity_requested bool                   `json:"humidity_requested"`
	Current_humidity   float64                `json:"current_humidity"`
	Target_humidity    float64                `json:"target_humidity"`
	Control_enabled    bool                   `json:"control_enabled"`
	Metadata           map[string]interface{} `json:"metadata"`
}

type HVAC struct {
	Ac_requested   bool    `json:"ac_requested"`
	Fan_requested  bool    `json:"fan_requested"`
	Heat_requested bool    `json:"heat_requested"`
	Temp_scale     string  `json:"temp_scale"`
	Target_temp    float64 `json:"target_temp"`
	Current_temp   float64 `json:"current_temp"`
}

type Outside struct {
	Current_temp       float64 `json:"current_temp"`
	Current_humidity   float64 `json:"current_humidity"`
	Current_condition  string  `json:"current_condition"`
	Current_wind_speed float64 `json:"current_wind_speed"`
	Current_wind_dir   string  `json:"current_wind_dir"`
}

func req_as_json(req *http.Request, user *User) (data map[string]interface{}, err error) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("user-agent", user_agent)

	if user != nil {
		req.Header.Set("Authorization", "Basic "+user.Access_token)
		req.Header.Set("X-n1-user-id", user.Userid)
		req.Header.Set("X-n1-protocol-version", "1")
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return
	}

	data = map[string]interface{}{}
	json.Unmarshal(body, &data)
	return
}

func POST(m map[string]interface{}, uri string, user *User) (data map[string]interface{}, err error) {
	jsonString, err := json.Marshal(m)
	if err != nil {
		return
	}

	req, err := http.NewRequest("POST", uri, bytes.NewBuffer(jsonString))
	if err != nil {
		return
	}
	//fmt.Println("POST", uri)

	data, err = req_as_json(req, user)
	return
}

func GET(uri string, user *User) (data map[string]interface{}, err error) {
	req, err := http.NewRequest("GET", uri, nil)
	if err != nil {
		return
	}
	//fmt.Println("GET", uri)

	data, err = req_as_json(req, user)
	return
}

func as_map(json map[string]interface{}, key string) map[string]interface{} {
	return json[key].(map[string]interface{})
}

func first_child(json map[string]interface{}) interface{} {
	for _, value := range json {
		return value
	}
	return nil
}

func find_in_array(arr []interface{}, key string, value interface{}) interface{} {
	for _, entry := range arr {
		_entry := entry.(map[string]interface{})
		if _entry[key] == value {
			return entry
		}
	}
	return nil
}

func device_state(hum, heat, cool bool) string {
	if hum {
		if heat {
			return "hum+heat"
		}
		if cool {
			return "hum+cool"
		}
		return "hum"
	}

	if heat {
		return "heat"
	}
	if cool {
		return "cool"
	}
	return "off"
}

func normalize_to_celcius(temp float64, units string) float64 {
	if units == "F" {
		return temp*1.8 + 32.0
	}
	return temp
}

func convert_to_celcius(temp float64, units string) float64 {
	if units == "F" {
		return (temp - 32) * 5 / 9
	}
	return temp
}

func init_user(e, p string) (user User, err error) {
	m := make(map[string]interface{})
	m["email"] = e
	m["password"] = p

	body, err := POST(m, LOGIN, &user)
	if err != nil {
		return
	}
	urls := as_map(body, "urls")

	user.Userid = body["userid"].(string)
	user.Access_token = body["access_token"].(string)
	user.Transport_url = urls["transport_url"].(string)
	user.Weather_url = urls["weather_url"].(string)
	return
}

func update_user(user *User) (err error) {
	_user, err := GET(user.Transport_url+"/v2/mobile/user."+user.Userid, user)
	if err != nil {
		return
	}

	where := first_child(as_map(_user, "where")).(map[string]interface{})
	structure := first_child(as_map(_user, "structure")).(map[string]interface{})

	if where == nil || structure == nil {
		return
	}

	forcast, err := GET(user.Weather_url+"forcast="+structure["postal_code"].(string)+","+structure["country_code"].(string), user)
	devices := as_map(_user, "device")
	current := as_map(first_child(forcast).(map[string]interface{}), "current")

	user.Home = Home{Inside: []Thermostat{},
		Outside: Outside{Current_temp: current["temp_f"].(float64),
			Current_humidity:   current["humidity"].(float64),
			Current_condition:  current["condition"].(string),
			Current_wind_speed: current["wind_mph"].(float64),
			Current_wind_dir:   current["wind_dir"].(string)}}

	sharedData := as_map(_user, "shared")
	for deviceId, _device := range devices {
		device := _device.(map[string]interface{})
		shared := as_map(sharedData, deviceId)

		user.Home.Inside = append(user.Home.Inside, Thermostat{Device: deviceId,
			Type:          "thermostat",
			Has_leaf:      device["leaf"].(bool),
			Location:      find_in_array(where["wheres"].([]interface{}), "where_id", device["where_id"]).(map[string]interface{})["name"].(string),
			State:         device_state(device["humidifier_state"].(bool), shared["hvac_heater_state"].(bool), shared["hvac_ac_state"].(bool)),
			Nest_metadata: Nest{Device: device, Shared: shared},
			Humidity: Humidity{Has_humidifier: device["has_humidifier"].(bool),
				Humidity_requested: device["humidifier_state"].(bool),
				Current_humidity:   device["current_humidity"].(float64),
				Target_humidity:    device["target_humidity"].(float64),
				Control_enabled:    device["target_humidity_enabled"].(bool),
				Metadata: map[string]interface{}{
					"type": device["humidifier_type"],
					"control_lockout_enabled":  device["humidity_control_lockout_enabled"],
					"control_lockout_start":    device["humidity_control_lockout_start_time"],
					"control_lockout_end_time": device["humidity_control_lockout_end_time"]}},
			Hvac: HVAC{Ac_requested: shared["hvac_ac_state"].(bool),
				Fan_requested:  device["fan_control_state"].(bool),
				Heat_requested: shared["hvac_heater_state"].(bool),
				Temp_scale:     device["temperature_scale"].(string),
				Target_temp:    normalize_to_celcius(shared["target_temperature"].(float64), device["temperature_scale"].(string)),
				Current_temp:   normalize_to_celcius(shared["current_temperature"].(float64), device["temperature_scale"].(string))}})
	}

	return
}

var DEVICE_REGEX = regexp.MustCompile(`/device/(?P<deviceId>.+?)/(?P<type>.+?)/+`)

func deviceRequest(req *http.Request) (string, string, bool) {
	if req.Method != "PUT" {
		return "", "", false
	}

	match := DEVICE_REGEX.FindStringSubmatch(req.URL.Path)
	if len(match) > 1 {
		return match[1], match[2], true
	}
	return "", "", false
}

func envRequest(req *http.Request) bool {
	if req.Method != "GET" {
		return false
	}
	return req.URL.Path == "/env"
}

func Server(f http.Handler, u *User) func(http.ResponseWriter, *http.Request) {
	return func(res http.ResponseWriter, req *http.Request) {
		if ok := envRequest(req); ok {
			js, err := json.Marshal(u.Home)
			if err != nil {
				res.WriteHeader(http.StatusBadRequest)
			} else {
				res.Header().Set("Content-Type", "application/json")
				res.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
				res.Write(js)
			}
		} else if deviceId, requestType, ok := deviceRequest(req); ok {
			body, err := ioutil.ReadAll(req.Body)
			if err != nil {
				//
			}

			data := map[string]interface{}{}
			err = json.Unmarshal(body, &data)

			if requestType == "hvac" {
				_, err = u.setTemp(deviceId, data["value"].(float64), data["units"].(string))
			} else {
				_, err = u.setHumidity(deviceId, int(data["value"].(float64)))
			}

			if err != nil {
				res.WriteHeader(http.StatusBadRequest)
			} else {
				res.WriteHeader(http.StatusNoContent)
				go func() {
					time.Sleep(time.Second * 5)
					update_user(u)
				}()
			}
		} else {
			f.ServeHTTP(res, req)
		}
	}
}

//Linear interpolation to map a source to a destination
func interpolate(sourceMin, sourceMax, destMin, destMax float64) func(float64) float64 {
	sourceDelta := sourceMax - sourceMin
	destDelta := destMax - destMin
	return func(source float64) float64 {
		return destMin + destDelta*(source-sourceMin)/sourceDelta
	}
}

type Credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func getCredentialsAndUser() (User, error) {
	usr, err := user.Current()
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	}

	credJson := path.Join(usr.HomeDir, ".hive", "creds.json")
	_, err = os.Stat(credJson)
	if err != nil {
		fmt.Println("User credentials do not exist at:", credJson)
		credJson = "./__data__/creds.json"
		fmt.Println("Falling back to build location:", credJson)
	}

	raw, err := ioutil.ReadFile(credJson)
	if err != nil {
		fmt.Println(err.Error())
		os.Exit(1)
	}

	var creds Credentials
	json.Unmarshal(raw, &creds)

	return init_user(creds.Email, creds.Password)
}

func main() {
	user, _ := getCredentialsAndUser()
	update_user(&user)
	http.HandleFunc("/", Server(http.FileServer(&assetfs.AssetFS{Asset: Asset, AssetDir: AssetDir, AssetInfo: AssetInfo, Prefix: "ui"}), &user))

	go func() {
		t := time.NewTicker(time.Second * 60)
		humidity_scale := interpolate(-20, 40, 15, 45)

		func() {
			for {
				select {
				case <-t.C:
					update_user(&user)

					temp_corrected_humidity := humidity_scale(user.Home.Outside.Current_temp)
					temp_corrected_humidity_normalized := normalize_humidity(int(temp_corrected_humidity))
					if temp_corrected_humidity_normalized > DESIRED_HUMIDITY {
						temp_corrected_humidity_normalized = DESIRED_HUMIDITY
					}

					for _, device := range user.Home.Inside {
						if device.Humidity.Has_humidifier {
							if int(device.Humidity.Target_humidity) != temp_corrected_humidity_normalized {
								user.setHumidity(device.Device, temp_corrected_humidity_normalized)
								fmt.Println("Outside temp is", user.Home.Outside.Current_temp, "relative humidity should not exceed", strconv.Itoa(int(temp_corrected_humidity))+"%", "setting target humidity to", strconv.Itoa(temp_corrected_humidity_normalized)+"%")
							}
						}

						if device.Humidity.Current_humidity > temp_corrected_humidity {
							fmt.Println(device.Location, "has", strconv.Itoa(int(device.Humidity.Current_humidity))+"%", "humidity, the max for the current outside temp of", user.Home.Outside.Current_temp, "is", strconv.Itoa(int(temp_corrected_humidity))+"%")
						}
					}
				}
			}
		}()
	}()

	http.ListenAndServe(":8080", nil)
}
