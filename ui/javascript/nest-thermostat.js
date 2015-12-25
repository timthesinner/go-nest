/**
 * Copyright (c) 2015 TimTheSinner All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
(function($, factory) {'use strict';
	var style = document.createElement('style');
	style.innerText = '.control.clickable:hover { cursor:pointer; } ::selection { background: rgba(0,0,0,0);) } ::-moz-selection { background: rgba(0,0,0,0); }';
	document.getElementsByTagName('head')[0].appendChild(style);

    if (typeof define === 'function' && define.amd) {
        define(['jquery'], function($) {
            return factory($);
        });
    } else {
        return factory($);
    }
} (window.jQuery || window.$ || null, function($) {'use strict';
	function between(value, test1, test2) {
		if (test1 === test2) 
			return value === test1;
		if (test1 < test2)
			return value > test1 && value < test2;
		return value > test2 && value < test1;
	}

	function distance(pt1, pt2) {
		var xs = pt2.x - pt1.x,
		    ys = pt2.y - pt1.y;

		return Math.sqrt(xs*xs + ys*ys);
	}

	function toInt(value) {
		return Math.round(value);
	}

	function affineTransformation(point, transform) {
		return {
			x: point.x*transform.a + point.y*transform.c + transform.e,
			y: point.x*transform.b + point.y*transform.d + transform.f
		}
	}

	var leaf = (function() {
		var _leaf = null;
		d3.xml("svg/leaf.svg", "image/svg+xml", function(xml) {
			_leaf = xml.documentElement;
		});
		return function(thermostat) {
			return {
				show: function() {
					if (_leaf) {
						var ele = thermostat.body.select('.leaf');
						if (!ele || ele.length != 1 || ele[0].length != 1 || !ele[0][0]) {
							ele = thermostat.body.append('svg').attr('class', 'leaf').attr('width', '20').attr('height', '20').attr('viewBox', '0 0 30 30');
							ele.html(_leaf.innerHTML);
						}

						ele.attr("x", thermostat.config.cx - 10)
						   .attr("y", (thermostat.config.cy * 1.60) - 10)
						   .attr('visibility', 'visible');
					}
				},
				hide: function() {
					var ele = thermostat.body.select('.leaf');
					if (ele && ele.length === 1 && ele[0].length === 1 && ele[0][0]) {
						ele.attr('visibility', 'hidden');
					}
				}
			} 
			return _leaf; 
		};
	})();

	window.Thermostat = function(thermostatId)
	{
		var self = this, // for internal d3 functions
		    _background = 'thermostat_state_background',
		    tempArcId = 'temp_arc' + thermostatId,
		    humArcId = 'hum_arc' + thermostatId;

		this.thermostatId = thermostatId;
		this.configure = function(configuration)
		{
			this.config = configuration;
			this.device = this.config.device;
			
			this.config.size = this.config.size * 0.9;
			
			this.config.radius = this.config.size * 0.97 / 2;
			this.config.cx = this.config.size / 2;
			this.config.cy = this.config.size / 2;
			
			this.config.min = {
				temp: 50,
				hum: 10
			};

			this.config.max = {
				temp: 90,
				hum: 60
			};

			this.config.scale = {
				temp: d3.scale.linear().domain([this.config.min.temp, this.config.max.temp]).range([0 - (Math.PI/4), Math.PI + (Math.PI/4)]),
				hum: d3.scale.linear().domain([this.config.min.hum, this.config.max.hum]).range([0 - (Math.PI/4), Math.PI + (Math.PI/4)])
			};

			this.config.range = {
				temp: this.config.max.temp - this.config.min.temp,
				hum: this.config.max.hum - this.config.min.hum
			};

			function bound(target, type) {
				if (target < self.config.min[type]) {
					return elf.config.min[type];
				} else if (target > self.config.max[type]) {
					return self.config.max[type];
				}
				return target;
			}

			this.config.update = {
				temp: function(target) { self.device.hvac['target_temp'] = bound(target, 'temp'); },
				hum: function(target) {
					var iTarget = toInt(Number(bound(target, 'hum')));
					self.device.humidity['target_humidity'] = iTarget - (iTarget % 5);
				}
			}

			this.config.set = {
				temp: function() {
					$.ajax({ 
						type: "PUT", contentType: "application/json",
						url: '/device/' + self.device.device + '/hvac/target_temp',
					    data: JSON.stringify({value:self.device.hvac['target_temp'], units:self.device.hvac['temp_scale']})
					});
				}, hum: function() {
					$.ajax({ 
						type: "PUT", contentType: "application/json",
						url: '/device/' + self.device.device + '/humidity/target_humidity',
					    data: JSON.stringify({value:self.device.humidity['target_humidity']})
					});
				}
			}
					
			this.config.transitionDuration = configuration.transitionDuration || 500;

			this.body = d3.select("#" + this.thermostatId)
								.append("svg:svg")
								.attr("class", "gauge")
								.attr("width", this.config.size)
								.attr("height", this.config.size);

			renderCircle('thermostat_outer', 1.0, '#ccc', '#000', '0.5px').attr('id', tempArcId);
			renderCircle(_background, 0.9, convertDeviceStateBackground(), '#e0e0e0', '2px').attr('id', humArcId);

			this.leaf = leaf(this);
			this.render();
			controls();

			return this;
		}

		var controls = (function() {
			function getMouse(evt) {
				var mouse = d3.mouse(evt); 
				return { x:mouse[0], y:mouse[1] };
			}

			function convertTan(rads) {
				rads = rads / Math.PI;
				if (rads < 0 && rads < -0.50) {
					return (2.0 + rads) * Math.PI;
				}
				return rads * Math.PI;
			}

			var state = (function() {
				var type = null;
				return { 
					down: function(_type) { type = _type; }, 
					type: function() { return type; },
					up: function() {
						if (type) {
							self.config.set[type]();
						}
						type = null; 
					}
				}
			})();

			function mouseToScale(evt) {
				var mouse = affineTransformation(getMouse(evt), evt.getTransformToElement(self.body[0][0])),
					rads = convertTan(Math.atan2(self.config.cy - mouse.y, self.config.cx - mouse.x));
				return self.config.scale[state.type()].invert(rads);
			}

			return function() {
				function setScale(evt) {
					if (state.type()) {
						var target = mouseToScale(evt);
						self.config.update[state.type()](target);
						self.render();
					}
				}

				function noProp() { d3.event.stopPropagation(); }

				function mousedown(type) {
					return function() {
						noProp();
						state.down(type);
						setScale(this);
					}
				}

				function mouseup() {
					noProp();
					setScale(this);
					state.up();
				}

				function mousemove() {
					noProp();
					setScale(this);
				}

				function trackable(ele) {
					return ele.on('mouseup', mouseup)
					   .on('mousemove', mousemove)
					   .classed('control', true);
				}
				function clickable(ele, type) {
					return trackable(ele)
					  	.on('mousedown', mousedown(type))
					    .classed('clickable', true);
				}

				self.body.append('rect').attr('x', 0).attr('y', 0).attr('width', self.config.size).attr('height', self.config.size).style('fill', 'rgba(0,0,0,0)')
					       .on('mousemove', noProp).on('mousedown', noProp).on('mouseup', function() { noProp(); state.up(); });
				trackable(renderCircle('background_control', 0.9, 'rgba(255,255,255,0.00)', 'rgba(255,255,255,0.00)', '0px'));
				clickable(renderArc('hum_control', 0.46, 0.65, '255,255,255,0.00'), 'hum');
				clickable(renderArc('temp_control', 0.70, 0.87, '255,255,255,0.00'), 'temp');
			}
		})();

		function _select(_class) {
			var ele = self.body.select('.' + _class);
			if (ele && ele.length === 1 && ele[0].length === 1 && ele[0][0]) {
				return ele;
			}
		}

		function convertDeviceStateBackground() {
			if (self.device.state === 'hum+heat' || self.device.state === 'heat') 
				return 'rgb(227,89,8)'
			if (self.device.state === 'hum+cool' || self.device.state === 'cool') 
				return 'rgb(0,110,237)'
			return 'rgb(70,70,70)'
		}

		function convertDeviceState() {
			if (self.device.state === 'hum+heat')
				return 'HUM + HEAT';
			if (self.device.state === 'hum') 
				return 'HUMIDIFYING';
			if (self.device.state === 'heat') 
				return 'HEATING';
			return 'TEMP SET TO';
		}

		function renderText(text, _class, fontRatio, yScale) {
			var fontSize = Math.round(self.config.size / fontRatio);

			var _text = _select(_class) || self.body.append("svg:text").attr("class", _class);

			_text.attr("x", self.config.cx)
					.attr("y", (self.config.cy * yScale) - fontSize / 2)
					.attr("dy", fontSize / 2)
					.attr("text-anchor", "middle")
					.text(text)
					.style("font-size", fontSize + "px")
					.style("fill", "rgba(255,255,255, 0.75)")
					.style("stroke-width", "0px");
		}

		function renderTextAtPoint(text, _class, fontRatio, point, anchor, color) {
			anchor = anchor || 'middle';

			if (color) {
				color = 'rgba(' + color + ',0.75)'
			} else {
				color = 'rgba(255,255,255,0.75)'
			}

			var _text = _select(_class) || self.body.append("svg:text").attr("class", _class);

			var fontSize = Math.round(self.config.size / fontRatio);
			_text.attr("x", point.x)
					.attr("y", point.y)
					.attr("dy", fontSize / 2)
					.attr("text-anchor", anchor)
					.text(text)
					.style("font-size", fontSize + "px")
					.style("font-weight", 'bold')
					.style("fill", color)
					.style("stroke-width", "0px");
			return _text;
		}

		function renderGraduation(degree, _class, start, end, width, opacity, color, type) {
			if (color) {
				color = 'rgba(' + color + ',' + opacity + ')'
			} else {
				color = 'rgba(255,255,255,' + opacity + ')'
			}

			var point1 = self.valueToPoint(degree, start, type),
			    point2 = self.valueToPoint(degree, end, type);
			_class = 'graduation_' + _class;
					
			var _line = _select(_class) || self.body.append("svg:line").attr("class", _class);
			_line.attr("x1", point1.x)
					.attr("y1", point1.y)
					.attr("x2", point2.x)
					.attr("y2", point2.y)
					.style("stroke", color)
					.style("stroke-width", width)
					.style('opacity', opacity);
			return _line;
		}

		function renderCircle(_class, factor, fill, stroke, strokeWidth) {
			var circle = _select(_class) || self.body.append("svg:circle").attr('class', _class);
			
			circle.attr("cx", self.config.cx)
					.attr("cy", self.config.cy)
					.attr("r", self.config.radius * factor)
					.style("fill", fill)
					.style("stroke", stroke)
					.style("stroke-width", strokeWidth);

			return circle;
		}

		function renderArc(_class, insideFactor, outsideFactor, rgba) {
			var _arc = _select(_class);

			if (! _arc) {
				var ptInside = self.valueToPoint(self.config.min.temp, insideFactor),
				    ptOutside = self.valueToPoint(self.config.min.temp, outsideFactor),
				    innerRadius = distance(ptInside, {x: self.config.cx, y: self.config.cy}),
					outerRadius = distance(ptOutside, {x: self.config.cx, y: self.config.cy}),
					scale = d3.scale.linear().domain([0, 100]).range([0 - (Math.PI/4), Math.PI + (Math.PI/4)]);

					_arc = self.body.append("path")
			        	.attr("d", d3.svg.arc().innerRadius(innerRadius).outerRadius(outerRadius).startAngle(scale(-1)).endAngle(scale(101)))
			        	.attr("transform", "translate(" + self.config.cx + "," + self.config.cy + ") rotate(270)")
			        	.attr("class", _class);
			}

			return _arc.style("fill", 'rgba(' + rgba + ')');
		}

		function renderGraduations(self, type, config) {
			var arcTextId = thermostatId + '_' + type + '_text_arc',
				textClass = '_' + type + '_text',
				arcTextClass = '_' + type + '_text_arc',
				pathTextClass = '_' + type + '_text_path';

			function renderTextOnArc(lhs, rhs, rgb) {
				var arc = _select(arcTextClass);
				if (arc) {
					arc.remove();
				}

				var ptInside = self.valueToPoint(self.config.min.temp, config.insideRadius),
					ptOutside = self.valueToPoint(self.config.min.temp, config.outsideRadius),
					innerRadius = distance(ptInside, {x: self.config.cx, y: self.config.cy}),
					outerRadius = distance(ptOutside, {x: self.config.cx, y: self.config.cy}),
					arcHeight = outerRadius - innerRadius,
					textHeight = arcHeight - 4,
					textRadius = innerRadius + (arcHeight / 2) - (self.config.size / config.offset.scale),
				    scale = d3.scale.linear().domain([self.config.min[type], self.config.max[type]]).range([Math.PI * (-3/4), Math.PI * (3/4)]),
					arc = d3.svg.arc().innerRadius(innerRadius).outerRadius(textRadius).startAngle(scale(lhs)).endAngle(scale(rhs));

				var text = _select(pathTextClass) || self.body.append("text")
															.attr('class', textClass)
															.attr('x', 0).attr('y', 0)//.attr('dy', (arcHeight/2))
															.attr('arc_height', arcHeight)
															.attr('text-anchor', 'start')
															.style('font-size', textHeight)
														  .append("textPath")
														    .attr('x', 0).attr('y', 0)
														  	.attr('class', pathTextClass).attr("xlink:href","#" + arcTextId);
				text.style('fill','rgba(' + rgb + ',1.0)')
					  .style("font-weight", 'bold')
					  .style("stroke-width", "0px");

				_select(textClass).insert("path", ':first-child').attr("d", arc)
					    .attr("id", arcTextId).attr("class", arcTextClass).attr("fill","rgba(255,0,0,0.0)")
					    .attr("transform", "translate(" + self.config.cx + "," + self.config.cy + ")");

				return text.text('');
			}

			var cur, tar;
			(function() {
          		setInterval(function() {
					var delayScale = d3.scale.linear().domain([cur, tar]).range([0, 750]);

					for (var degree = self.config.min[type]; degree <= self.config.max[type]; degree += config.graduationDelta) {
						var _class =  'graduation_' + ('tick_' + degree + '_' + type).replace('\.', '_');
						var grad = _select(_class);
						if (grad) {
							grad.transition().duration(0);
						}
					}

					for (var degree = self.config.min[type]; degree <= self.config.max[type]; degree += config.graduationDelta) {
						var _class =  'graduation_' + ('tick_' + degree + '_' + type).replace('\.', '_');
						if (between(degree, cur, tar)) {
							var _class =  'graduation_' + ('tick_' + degree + '_' + type).replace('\.', '_');
							var grad = _select(_class);
							if (grad) {
								grad.transition().duration(750).delay(delayScale(degree)).ease("elastic").style('opacity', 1.0)
							       .each("end", function() {  d3.select(this).transition().duration(750).ease("elastic").style("opacity",0.65); });
							}
						}
					}
          		}, 5000);
      		})();

			return function(current, target, rgb) {
				rgb = rgb || '255,255,255';
				cur = current;
				tar = target;

				//Render the current value in the arc
				var iCurrent = toInt(current);
				var iTarget = toInt(target);
				var delayScale;
				if (current < target) {
					delayScale = d3.scale.linear().domain([current, target]).range([0, 750]);
					renderTextOnArc(current - config.offset.before, current, rgb).text(iCurrent);
				} else {
					delayScale = d3.scale.linear().domain([target, current]).range([0, 750]);
					renderTextOnArc(current + config.offset.afterLeft, current + config.offset.afterRight, rgb).text(iCurrent);
				}

				//Render the graduations
				renderGraduation(current, 'current_' + type + '_mark', config.insideRadiusCurrent, config.outsideRadius, "4px", 1.0, rgb, type);
				renderGraduation(target, 'target_' + type + '_mark', config.insideRadiusTarget, config.outsideRadius, "4px", 1.0, rgb, type);
				for (var degree = self.config.min[type]; degree <= self.config.max[type]; degree += config.graduationDelta) {
					var _class = ('tick_' + degree + '_' + type).replace('\.', '_');
					if (between(degree, current, target)) {
						renderGraduation(degree, _class, config.insideRadius, config.outsideRadius, "2px", 0.65, rgb, type);
					} else {
						renderGraduation(degree, _class, config.insideRadius, config.outsideRadius, "2px", 0.35, rgb, type).transition().duration(0);
					}
				}				
			}
		}

		//Function to render the temperature scale
		var renderTempScale = renderGraduations(self, 'temp', {
			outsideRadius: 0.85,
			insideRadiusCurrent: 0.68,
			insideRadiusTarget: 0.65,
			insideRadius: 0.70,
			graduationDelta: 0.33,
			offset: {
				before: 2.0,
				afterLeft: 0.5,
				afterRight: 2.0,
				scale: 50.0
			}
		});

	    //Function to render the humidity scale
		var renderHumidityScale = renderGraduations(self, 'hum', {
			outsideRadius: 0.63,
			insideRadiusCurrent: 0.48,
			insideRadiusTarget: 0.46,
			insideRadius: 0.50,
			graduationDelta: 0.5,
			offset: {
				before: 2.75,
				afterLeft: 0.75,
				afterRight: 3.0,
				scale: 56.0
			}
		});

		this.render = function()
		{			
			var background = _select(_background);
			if (background) {
				background.style("fill", convertDeviceStateBackground())
			}

			if (this.device.location != undefined)
			{
				renderText(this.device.location, 'location', 27, 1.75);
			}

			if (this.device['has_leaf']) {
				this.leaf.show();
			} else {
				this.leaf.hide();
			}

			var currentTemp = Number(this.device.hvac['current_temp']);
			var targetTemp = Number(this.device.hvac['target_temp']);
			if (targetTemp != undefined) {
				renderText(toInt(targetTemp) + '°' + this.device.hvac['temp_scale'], 'temp', 9, 1.0);
			}

			if (convertDeviceState() != undefined) {
				renderText(convertDeviceState(), 'state', 20, 0.8);
			}
			renderTempScale(currentTemp, targetTemp, '255,255,255');

			var currentHum = toInt(Number(self.device.humidity['current_humidity']));
		    var targetHum = toInt(Number(self.device.humidity['target_humidity']));
			if (! this.device.humidity['control_enabled']) {
				renderText('HUMIDITY ' + currentHum + '%', 'hum_disp', 30, 1.10);
			} else if (! this.device.humidity['humidity_requested']) {
				renderText('HUMIDITY SET TO ' + targetHum + '%', 'hum_disp', 30, 1.10);
				renderArc('hum_backing_arc', 0.46, 0.65, '70,70,70,0.80');
				renderHumidityScale(currentHum, targetHum, '0,175,216');
			} else {
				renderText('HUMIDITY SET TO ' + targetHum + '%', 'hum_disp', 30, 1.10);
				renderArc('hum_backing_arc', 0.46, 0.65, '0,175,216,0.65');
				renderHumidityScale(currentHum, targetHum, '255,255,255');			
			}
		}
			
		this.redraw = function(device)
		{
			self.device = device;
			self.render();
		}
		
		this.valueToDegrees = function(value, type)
		{
			type = type || 'temp'
			return value / this.config.range[type] * 270 - (this.config.min[type] / this.config.range[type] * 270 + 45);
		}
		
		this.valueToRadians = function(value, type)
		{
			return this.valueToDegrees(value, type) * Math.PI / 180;
		}
		
		this.valueToPoint = function(value, factor, type)
		{
			type = type || 'temp';
			return { 	
				x: this.config.cx - this.config.radius * factor * Math.cos(this.config.scale[type](value)),
				y: this.config.cy - this.config.radius * factor * Math.sin(this.config.scale[type](value)) 		
			};
		}	
	}
}));