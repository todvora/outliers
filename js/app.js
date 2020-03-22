var app = new Vue({

    el: '#app',
    data: {
        gpx: null,
        path: [],
        elevationGain: 0,
        leaflet: {
            map: null,
            polyline: null,
            markers: [],
            elevation: null,
            zoom: false
        }
    },
    computed: {
        name: function () {
            if (this.gpx) {
                return this.gpx.getElementsByTagName('name')[0].innerHTML;
            } else {
                return null;
            }
        }
    },
    methods: {
        toRadians: function (degrees) {
            return degrees * Math.PI / 180;
        },
        pointsDistance: function (x, y) {
            var R = 6371e3; // metres
            var φ1 = this.toRadians(x.lat);
            var φ2 = this.toRadians(y.lat);
            var Δφ = this.toRadians(y.lat - x.lat);
            var Δλ = this.toRadians(y.lon - x.lon);
            var a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            var d = R * c;
            return d;
        },
        parseGpxData: function (data) {
            this.gpx = data;
        },
        loadGpx: function () {
            fetch('data.gpx')
                .then(response => response.text())
                .then(str => (new window.DOMParser()).parseFromString(str, "text/xml"))
                .then(data => this.parseGpxData(data));
        },
        initializeLeaflet: function () {
            this.leaflet.map = L.map('mapid').setView([51.505, -0.09], 13);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(this.leaflet.map);
        },
        removePoint: function (index, point) {
            this.path.splice(index, 1);
        },
        createPopup: function (index, distance, point) {
            const popup = document.createElement('div');
            const info = document.createElement('p');
            info.appendChild(document.createTextNode(`Distance: ${distance.toFixed(1)}m`));
            popup.appendChild(info);
            const removeLink = document.createElement('a');
            removeLink.innerText = 'Remove';
            removeLink.onclick = () => {
                this.removePoint(index, point);
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
        createElevationProfile: function (points) {
            var legend = L.control({position: 'bottomright'});
            const that = this;
            legend.onAdd = function (map) {
                var div = L.DomUtil.create('div', 'info legend');
                div.style.width = (document.body.offsetWidth - 20) + 'px';
                div.style.height = "300px";
                const canvas = document.createElement('canvas');
                canvas.setAttribute("width", document.body.offsetWidth);
                canvas.setAttribute("height", 300);
                div.appendChild(canvas);

                var ctx = canvas.getContext('2d');
                const elevations = points.map(p => p.ele);
                var chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: elevations,
                        datasets: [{
                            label: `Elevation gain ${that.computeElevationGain(points).toFixed(1)}m`,
                            pointRadius: 0,
                            backgroundColor: 'rgb(0,43,255, 0.2)',
                            borderColor: 'rgb(0,43,255)',
                            data: elevations
                        }]
                    },

                    // Configuration options go here
                    options: {
                        legend: {
                            display: true
                        },
                        scales: {
                            xAxes: [{
                                display: false //this will remove all the x-axis grid lines
                            }]
                        }
                    }

                });

                return div;
            };
            return legend;
        }
    },
    watch: {
        gpx: function () {
            if (this.gpx) {
                // create a red polyline from an array of LatLng points

                const elements = this.gpx.getElementsByTagName('trkpt');

                const points = [];

                for (let item of elements) {
                    const lat = item.getAttribute('lat');
                    const lon = item.getAttribute('lon');
                    const ele = item.getElementsByTagName('ele')[0].innerHTML;
                    const time = item.getElementsByTagName('time')[0].innerHTML;
                    points.push({
                        lat: parseFloat(lat),
                        lon: parseFloat(lon),
                        ele: parseFloat(ele),
                        time: time
                    });
                }
                this.path = points;
            } else {
                return null;
            }
        },
        path: function (points) {

            if (this.leaflet.polyline) {
                this.leaflet.polyline.remove(this.leaflet.map);
                this.leaflet.markers.forEach(marker => marker.remove(this.leaflet.map));
            }

            if (this.leaflet.elevation) {
                this.leaflet.elevation.remove(this.leaflet.map);
            }

            this.leaflet.elevation = this.createElevationProfile(points);
            this.leaflet.elevation.addTo(this.leaflet.map);

            const path = points.map(point => [point.lat, point.lon]);
            this.leaflet.polyline = L.polyline(path, {color: 'red'}).addTo(this.leaflet.map);
            // zoom the map to the polyline

            if (!this.leaflet.zoom) {
                this.leaflet.map.fitBounds(this.leaflet.polyline.getBounds());
                this.leaflet.zoom = true;
            }


            for (let i = 1; i < points.length; i++) {
                const prev = points[i - 1];
                const curr = points[i];
                let distance = this.pointsDistance(prev, curr);
                if (distance > 10) {
                    let marker = L.marker([curr.lat, curr.lon]);
                    this.leaflet.markers.push(marker);
                    marker.addTo(this.leaflet.map);
                    marker.bindPopup(this.createPopup(i, distance, curr));
                }

            }
        }
    },
    mounted: function () {
        this.initializeLeaflet();
        this.loadGpx();
    }
});

