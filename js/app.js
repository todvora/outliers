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
        ,
    },
    methods: {
        pointsDistance: function (x, y) {
            return x.latLon().distanceTo(y.latLon());
        },
        initializeLeaflet: function () {
            this.leaflet.map = L.map('mapid').setView([47.8095, 13.0550], 12);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(this.leaflet.map);
        },
        removePoint: function (index, point) {
            this.points[index].enabled = false;
            this.renderPoints();
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
            const str = serializer.serializeToString(this.gpx);
            var data = new Blob([str], {type: 'type: "application/gpx+xml"'});

            const a = document.createElement('a');
            document.body.appendChild(a);
            const url = window.URL.createObjectURL(data);
            a.href = url;
            a.download = this.name + '.gpx';
            a.click();
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 0)
        },
        removeFile: function () {
            this.gpx = null;
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

            this.leaflet.zoom = false;

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
                            label: 'Elevation gain',
                            pointRadius: 0,
                            backgroundColor: 'rgb(0,43,255, 0.2)',
                            borderColor: 'rgb(0,43,255)',
                            data: elevations
                        }]
                    },

                    // Configuration options go here
                    options: {
                        legend: {
                            display: false
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
        },
        renderPoints: function () {
            console.log('Rendering polyline');
            this.clearMap();
            const points = this.points.filter(p => p.enabled);
            const path = points.map(point => [point.lat, point.lon]);

            this.leaflet.polyline = L.polyline(path, {color: 'red'}).addTo(this.leaflet.map);
            // zoom the map to the polyline

            if (!this.leaflet.zoom) {
                this.leaflet.map.fitBounds(this.leaflet.polyline.getBounds());
                this.leaflet.zoom = true;
            }

            console.log('Rendering elevation profile');

            this.leaflet.elevation = this.createElevationProfile(points);
            this.leaflet.elevation.addTo(this.leaflet.map);

            console.log('Elevation profile rendered');

            this.elevationGain = this.computeElevationGain(points);

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
    watch: {
        gpx: function () {
            if (this.gpx) {
                const elements = this.gpx.getElementsByTagName('trkpt');

                const points = [];

                for (let item of elements) {
                    const lat = item.getAttribute('lat');
                    const lon = item.getAttribute('lon');
                    const ele = item.getElementsByTagName('ele')[0].innerHTML;
                    const time = item.getElementsByTagName('time')[0].innerHTML;
                    const point = {
                        lat: parseFloat(lat),
                        lon: parseFloat(lon),
                        ele: parseFloat(ele),
                        time: time,
                        ref: item,
                        distanceDiff: 0,
                        elevationDiff: 0,
                        latLon: function () {
                            return L.latLng(this.lat, this.lon);
                        },
                        isOutlier: false,
                        enabled: true
                    };
                    points.push(point);
                }
                this.points = points;
                console.log('Points parsed and computed');
            } else {
                this.clearMap();
            }
        },
        points: function () {
            this.renderPoints();

        }
    },
    mounted: function () {
        this.initializeLeaflet();
    }
});

