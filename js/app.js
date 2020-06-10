var app = new Vue({

    el: '#app',
    data: {
        gpx: null,
        filename: null,
        points: [],
        elevationGain: null,
        leaflet: {
            map: null,
            polyline: null,
            markers: [],
            elevation: null,
            zoom: 12,
            initialZoom: false,
            multiselect: false,
            selectArea: null
        }
    },
    computed: {
        name: function () {
            if (this.gpx) {
                return this.gpx.getElementsByTagName('name')[0].innerHTML;
            } else {
                return null;
            }
        },
        pointRadius: function () {
            return Math.max(1, (this.leaflet.zoom - 16) * 3);
        }
    },
    methods: {
        initializeLeaflet: function () {
            this.leaflet.map = L.map('mapid', {preferCanvas: true}).setView([47.8095, 13.0550], this.leaflet.zoom);
            this.leaflet.map.on("zoomend", (e) => {
                this.leaflet.zoom = this.leaflet.map.getZoom();
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxNativeZoom: 19,
                maxZoom: 25
            }).addTo(this.leaflet.map);
        },
        removePoint: function (index, point) {
            this.points[index].enabled = false;
            this.renderPoints();
        },
        switchMultiselect: function() {
           this.leaflet.multiselect = !this.leaflet.multiselect;
        },
        removeSelected: function() {
            const markers = this.leaflet.selectArea.getFeaturesSelected('circlemarker');
            if(confirm(`Found ${markers.length} points to be removed, continue?`)) {
                markers.forEach(marker => {
                    this.points[marker.dataPoint.index].enabled = false;
                });
                this.renderPoints();
                this.leaflet.multiselect = false;
            }
        },
        createPopup: function (point) {
            const popup = document.createElement('div');
            const info = document.createElement('p');
            info.appendChild(document.createTextNode(`Distance: ${point.distanceDiff.toFixed(1)}m`));
            info.appendChild(document.createElement('br'));
            info.appendChild(document.createTextNode(`Elevation diff: ${point.elevationDiff.toFixed(1)}m`));
            popup.appendChild(info);
            const removeLink = document.createElement('a');
            removeLink.innerText = 'Remove';
            removeLink.onclick = () => {
                this.removePoint(point.index, point);
            };
            popup.appendChild(removeLink);
            return popup;
        },
        computeElevationGain: function (points) {
            let elevationGain = 0;
            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                if (curr.ele > prev.ele) {
                    elevationGain = elevationGain + (curr.ele - prev.ele);
                }
            }
            return elevationGain;

        },
        loadFile: function (event) {
            console.log('Loading file', event);
            const file = event.target.files[0];
            this.filename = file.name;
            const reader = new FileReader();
            reader.onload = (evt) => {
                this.gpx = new window.DOMParser().parseFromString(evt.target.result, "text/xml");
                console.log('File loaded and parsed');
            };
            reader.readAsText(file);
        },
        downloadFile: function () {
            const serializer = new XMLSerializer();

            this.points
                .filter(point => !point.enabled)
                .forEach(point => {
                    point.ref.parentNode.removeChild(point.ref);
                });

            const str = serializer.serializeToString(this.gpx);
            var data = new Blob([str], {type: 'type: "application/gpx+xml"'});

            const a = document.createElement('a');
            document.body.appendChild(a);
            const url = window.URL.createObjectURL(data);
            a.href = url;
            a.download = this.filename.replace('.gpx', '_fixed.gpx');
            a.click();
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 0)
        },
        removeFile: function () {
            this.gpx = null;
        },
        detectOutliers: function (points) {

            if(true) {
                // disable autodetection for now
                return points;
            }

            const initialTime = new Date(points[0].time).getTime();
            points[0].timeSinceStart = 0;

            console.log(points[0]);

            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                curr.distanceDiff = curr.distanceTo(prev);
                curr.elevationDiff = curr.ele - prev.ele;
                curr.timeSinceStart = (new Date(curr.time).getTime() - initialTime) / 1000;
            }

            const totalDistance = points.reduce((acc, item) => acc + item.distanceDiff, 0.0);
            console.log('Total distance', totalDistance);
            const averageDistanceDiff = totalDistance / points.length;
            console.log('Average points distance', averageDistanceDiff);


            var loess = science.stats.loess().bandwidth(.2);
            var xs = points.map(p => p.timeSinceStart);
            var ys = points.map(p => p.ele);
            const fitted = loess(xs, ys);

            points
                .filter(point => Math.abs(point.ele - fitted[point.timeSinceStart]) > 20)
                .forEach(point => {
                    point.isOutlier = true;
                });

            return points;
        },
        clearMap: function () {
            if (this.leaflet.polyline) {
                this.leaflet.polyline.remove(this.leaflet.map);
                this.leaflet.markers.forEach(marker => marker.remove(this.leaflet.map));
                this.leaflet.polyline = null;

                while (this.leaflet.markers.length > 0) {
                    this.leaflet.markers.pop();
                }

            }
            if (this.leaflet.elevation) {
                this.leaflet.elevation.remove(this.leaflet.map);
                this.leaflet.elevation = null;
            }
        },
        renderElevationChart: function (points) {

          d3.select("#elevation svg").remove();

          var parentDiv = document.getElementById("elevation");

          var margin = {top: 10, right: 10, bottom: 20, left: 70},
              width = parentDiv.clientWidth - margin.left - margin.right,
              height = 170 - margin.top - margin.bottom;

           // set the ranges
           var x = d3.scaleTime().range([0, width]);
           var y = d3.scaleLinear().range([height, 0]);

           // define the line
           var valueline = d3.line()
               .x(function(d) { return x(d.date); })
               .y(function(d) { return y(d.ele); });

           var svg = d3.select("#elevation").append("svg")
               .attr("width", width + margin.left + margin.right)
               .attr("height", height + margin.top + margin.bottom)
             .append("g")
               .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

          // Scale the range of the data
           x.domain(d3.extent(points, function(d) { return d.date; }));
           y.domain(d3.extent(points, function(d) { return d.ele; }));

           // Add the valueline path.
           svg.append("path")
               .data([points])
               .attr("class", "line")
               .attr("d", valueline);

           // Add the x Axis
           svg.append("g")
               .attr("transform", "translate(0," + height + ")")
               .call(d3.axisBottom(x));

           // Add the y Axis
           svg.append("g")
               .call(d3.axisLeft(y));


        },
        renderPoints: function () {
            console.log('Rendering polyline');
            this.clearMap();
            const points = this.points.filter(p => p.enabled);
            const path = points.map(point => [point.lat, point.lon]);

            this.leaflet.polyline = L.polyline(path, {color: 'red'}).addTo(this.leaflet.map);

            // zoom the map to the polyline
            if(!this.leaflet.initialZoom) {
                this.leaflet.map.fitBounds(this.leaflet.polyline.getBounds());
                this.leaflet.initialZoom = true;
            }

            console.log('Rendering elevation profile');

            this.renderElevationChart(points);

            console.log('Elevation profile rendered');

            this.elevationGain = this.computeElevationGain(points);
            points
                .forEach(point => {
                    let marker = L.circleMarker([point.lat, point.lon], {
                        color: point.isOutlier ? '#ff0000' : '#3388ff',
                        radius: this.pointRadius
                    });
                    marker.bindPopup(this.createPopup(point));
                    marker.dataPoint = point;
                    this.leaflet.markers.push(marker);
                });

            this.leaflet.markers.forEach(marker => {
                marker.addTo(this.leaflet.map);
            });

        }
    },
    watch: {
        gpx: function () {
            if (this.gpx) {
                const elements = this.gpx.getElementsByTagName('trkpt');

                const points = [];

                for (let i = 0; i < elements.length; i++) {
                    const item = elements[i];
                    const lat = item.getAttribute('lat');
                    const lon = item.getAttribute('lon');
                    const ele = item.getElementsByTagName('ele')[0].innerHTML;
                    const time = item.getElementsByTagName('time')[0].innerHTML;
                    const point = {
                        index: i,
                        lat: parseFloat(lat),
                        lon: parseFloat(lon),
                        ele: parseFloat(ele),
                        time: time,
                        date: new Date(time),
                        ref: item,
                        distanceDiff: 0,
                        elevationDiff: 0,
                        distanceTo: function (other) {
                            return L.latLng(this.lat, this.lon).distanceTo(L.latLng(other.lat, other.lon));
                        },
                        isOutlier: false,
                        enabled: true
                    };
                    points.push(point);
                }
                this.points = this.detectOutliers(points);
                console.log('Points parsed and computed');
            } else {
                this.clearMap();
            }
        },
        points: function () {
            this.renderPoints();
        },
        pointRadius: function () {
            this.leaflet.markers.forEach(marker => {
                marker.setRadius(this.pointRadius);
            });
        },
        'leaflet.multiselect': function () {
            if(this.leaflet.multiselect) {
                this.leaflet.selectArea = this.leaflet.map.selectAreaFeature.enable();
            } else {
                this.leaflet.selectArea.removeAllArea();
                this.leaflet.selectArea.disable();
            }
        }
    },
    mounted: function () {
        this.initializeLeaflet();
    }
});

