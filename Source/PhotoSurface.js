/*
---

script: PhotoSurface.js

description: Play with your photos on a surface, like you did when they weren't digital. 

license: MIT-style

authors:
- Martin Pengelly-Phillips

requires:
- core:1.2.4

provides: [PhotoSurface, Photo, PhotoElement, PhotoData, PhotoFX]

...
*/


var PhotoFX = new Class({
    Extends: Fx,
    
    options: {
        link: 'cancel'
    },

    initialize: function(renderer, options) {
        this.renderer = renderer;
        this.parent(options);
    },

    set: function(now) {
        for (var property in now) this.target[property] = now[property];
        this.target.update();
        this.renderer.update({layers:'active'});
        return this;
    },

    compute: function(from, to, delta) {
        var now = {};
        for (var p in from) now[p] = this.parent(from[p], to[p], delta);
        return now;
    },

    start: function(target, properties) {
        this.target = target;

        var from = {}, to = {};
        for (var property in properties) {
            from[property] = properties[property][0];
            to[property] = properties[property][1];
        }
        return this.parent(from, to);
    }

});



var PhotoSurface = new Class({
    Implements: [Options, Events],

    options: {
        'className': 'photo-surface',   // class applied to constructed container element
        'manageResize': true,       // whether surface should auto manage window resize events
        'click': {
            duration: 500, // maximum time between mouse down and up to determine mode
            distance: 25 // maximum distance travelled between mouse down and up to determine mode
        }
        
    },

    initialize: function(options) {
        this.setOptions(options);
        
        this.timers = {activate: null};

        this.photos = $H({
            inactive: $A([]), // holds all inactive photo instances
            active: $A([])    // holds active photo instances
        });

        // elements
        this.elements = {};
        this.elements.container = new Element('div', {'class':this.options.className});
        this.elements.inactive = new Element('canvas').inject(this.elements.container);
        this.elements.active = new Element('canvas').inject(this.elements.container);
          
        // events
        this.elements.container.addEvent('mousemove', this.onMouseMove.bindWithEvent(this));
        this.elements.container.addEvent('mousedown', this.onMouseDown.bindWithEvent(this));
        this.elements.container.addEvent('mouseup', this.onMouseUp.bindWithEvent(this));
        this.elements.container.addEvent('mouseleave', this.onMouseUp.bindWithEvent(this));
        
        if (this.options.manageResize)
        {
            window.addEvent('resize', function() {
                this.positionPhotos('conform').update();
            }.bind(this));
        }
    },

    attach: function(el, position)
    {
        var pos = position || 'bottom';
        this.elements.container.inject(el, pos);
        this.update();
        return this;
    },

    detach: function()
    {
        this.elements.container.dispose();
        return this;
    },

    add: function(photos, options)
    {
        var options = $extend({
            placement: 'random', // how to place photos (choice of 'random', 'as-is')
            normalise: true // normalise the photos on add
        }, options || {});
        
        if ($type(photos) != "array")
        {
            photos = $A([photos]);
        }
        
        // if the photo is a string auto-create a Photo wrapper
        // :note: it will be added again once image data loaded so we skip it now
        var surface = this;
        var ready = $A([]);
        
        photos.map(function(p) {
            if ($type(p) == "string") 
            {
                photo = new Photo(p, { 
                    onLoaded: function(photo) {
                        photo.removeEvents('loaded'); 
                        this.add(photo); 
                    }.bind(surface) 
                });
            }
            else
            {
                ready.push(p);
            }
        });
        photos = ready;
        
        if (options.normalise == true)
        {
            this.normalisePhotos({photos:photos});
        }
        
        // ensure each photo is at deactivated scale
        photos.each(function(photo) {
            if (photo.scale != photo.options.deactivated.scale)
            {
                photo.scale = photo.options.deactivated.scale;
                photo.update();
            }
        }, this);
        
        if (options.placement == 'random')
        {
            this.positionPhotos(options.placement, {photos:photos});
        }
        
        photos.each(function(photo) {
            // all photos inactive by default
	        photo.active = false;
	        this.photos.inactive.push(photo);
	        
            // Firefox sometimes has issues with this function being called multiple times in quick succession
	        // and ends up throwing a NS_ERROR_NOT_AVAILABLE error. As a bit of hack to protect those
	        // using this library an artificial delay is added in.
	        photo.paint.delay(100, photo, this.elements.inactive.getContext('2d'));
        }, this);
 
        return this;
    },

    remove: function(photos)
    {
        if ($type(photos) != "array")
        {
            photos = $A([photos]);
        }
        
        photos.each(function(photo) {
	        this.photos.inactive.erase(photo);
	        this.photos.active.erase(photo);
        }, this);
        this.update();

        return this;
    },

    empty: function()
    {
        this.photos.inactive.empty();
        this.photos.active.empty();
        this.update();
        return this;
    },

    update: function(options)
    {
        var options = $extend({
            layers:'both'       // the layers to paint ('inactive', 'active' or 'both')
        }, options || {});
        
        var size = this.elements.container.getSize();
        
        if (options.layers != 'inactive')
        {
            var canvas = this.elements.active;
            canvas.setProperties({width:size.x, height:size.y});
            var context = canvas.getContext('2d');
            context.clearRect(0, 0, size.x, size.y);
            
            for (var i=0, l=this.photos.active.length; i<l; i++)
            {
                this.photos.active[i].paint(context);
            }
        }
        if (options.layers != 'active')
        {
            var canvas = this.elements.inactive;
            canvas.setProperties({width:size.x, height:size.y});
            var context = canvas.getContext('2d');
            context.clearRect(0, 0, size.x, size.y);

            for (var i=0, l=this.photos.inactive.length; i<l; i++)
            {
                this.photos.inactive[i].paint(context);
            }
        }

        return this;
    },

    findTarget: function(position, stack)
    {
        var target = this._findTarget(position, this.photos.active)
        if (target == null)
            target = this._findTarget(position, this.photos.inactive)
        return target;
    },

    _findTarget: function(position, stack)
    {
        for (var i=stack.length-1; i>=0; i--)
        {
            var photo = stack[i];
            var lines =
            {
                topline: { o: photo.bounds.tl, d: photo.bounds.tr   },
                rightline: { o: photo.bounds.tr, d: photo.bounds.br },
                bottomline: { o: photo.bounds.br, d: photo.bounds.bl },
                leftline: { o: photo.bounds.bl, d: photo.bounds.tl }
            };

            var b1, b2, a1, a2, xi, yi;
            var xcount = 0;
            var iLine = null;
            for (line in lines)
            {
                iLine = lines[line];
                // optimisation 1: line below dot. no cross
                if ((iLine.o.y < position.y) && (iLine.d.y < position.y)) {
                    continue;
                }
                // optimisation 2: line above dot. no cross
                if ((iLine.o.y >= position.y) && (iLine.d.y >= position.y)) {
                    continue;
                }
                // optimisation 3: vertical line case
                if ((iLine.o.x == iLine.d.x) && (iLine.o.x >= position.x)) {
                    xi = iLine.o.x;
                    yi = position.y;
                }
                // calculate the intersection point
                else {
                    b1 = 0; //(y2-mp.ey)/(x2-mp.ex);
                    b2 = (iLine.d.y-iLine.o.y)/(iLine.d.x-iLine.o.x);
                    a1 = position.y-b1*position.x;
                    a2 = iLine.o.y-b2*iLine.o.x;

                    xi = - (a1-a2)/(b1-b2);
                    yi = a1+b1*xi;
                }

                // dont count xi < mp.ex cases
                if (xi >= position.x) {
                    xcount += 1;
                }
                // optimisation 4: specific for square images
                if (xcount == 2) {
                    break;
                }
            }

            if (xcount % 2 == 1 && xcount != 0)
            {
                return photo;
            }
        }
        return null;
    },

    activate: function(photo, pos)
    {
        // for nicer viewing of images where supported
        this.elements.container.style.cursor = 'none';

        // set click offset on photo
        photo.clickOffset = {x: pos.x - photo.x, y: pos.y - photo.y};

        // set photo to be active
        photo.active = true;
        photo.activated = $time();

        // photo already in active stack?
        if (!this.photos.active.contains(photo))
        {
            var removed = this.photos.inactive.splice(this.photos.inactive.indexOf(photo), 1);
            this.photos.active.push(photo);
        }

        // select animation
        if (photo.selectEffect == undefined)
        {
            photo.selectEffect = new PhotoFX(this, {transition:Fx.Transitions.Cubic.easeIn, duration: 750});
        }

        // cancel any deselect animation
        if (photo.deselectEffect)
            photo.deselectEffect.cancel();

        // with mild random rotation?
        var theta = photo.options.activated.theta;
        if (theta == 'random')
        {
            theta = photo.theta+((Math.floor(Math.random() * 45) - 20)*(Math.PI/180))*((photo.scale-photo.options.activated.scale)/0.7);
        }
        
        // start select animation
        photo.selectEffect.start(photo, {
            scale:[photo.scale, photo.options.activated.scale],
            theta: [photo.theta, theta]
        });

        // fire callback events
        this.fireEvent('activated', photo);

        this.update();
    },

    deactivate: function(photo)
    {
        // set photo to not active
        photo.active = false;
        photo.deactivated = $time();

        // revert to normal cursor style
        this.elements.container.style.cursor = 'move';

        // deselect animation
        if (photo.deselectEffect == undefined)
        {
            photo.deselectEffect = new PhotoFX(this, {
                transition:Fx.Transitions.Quad.easeOut,
                duration: 300,
                onComplete: this._deactivate.bind(this, photo)
           });
        }

        // cancel any select animation
        if (photo.selectEffect)
            photo.selectEffect.cancel();
            
        // with mild random rotation?
        var theta = photo.options.deactivated.theta;
        if (theta == 'random')
        {
            theta = photo.theta+((Math.floor(Math.random() * 45) - 20)*(Math.PI/180))*((photo.scale-photo.options.deactivated.scale)/0.7);
        }

        // start deselect animation
        photo.deselectEffect.start(photo, {
            scale:[photo.scale, photo.options.deactivated.scale],
            theta: [photo.theta, theta]
        });

        // fire callback events
        this.fireEvent('deactivated', photo);
    },

    _deactivate: function(photo)
    {
        var removed = this.photos.active.splice(this.photos.active.indexOf(photo), 1);
        this.photos.inactive.push(photo);
        this.update();
    },

    onMouseDown: function(event)
    {
        var el = this.elements.container.getPosition();
        var pos = {
            x: event.page.x-el.x,
            y: event.page.y-el.y
        };
        this.click = {time: $time(), position: {x:pos.x, y:pos.y} };

        if (!this.photos.active.length || this.photos.active[this.photos.active.length-1].active == false)
        {
            var target = this.findTarget(pos);
            if (target != null)
                this.activate(target, pos);
        }
    },

    onMouseUp: function(event)
    {
        if (this.click == null)
            return;

        var click = $time();

        var el = this.elements.container.getPosition();
        var pos = {
            x: event.page.x-el.x,
            y: event.page.y-el.y
        };

        // single click selection/deselection
        if (click - this.click.time < this.options.click.duration)
        {
            if (this.photos.active.length && this.photos.active[this.photos.active.length-1].active == true)
            {
                // determine if mode was drag move or click
	            if ( (($time() - this.photos.active[this.photos.active.length-1].activated) > this.options.click.duration) ||
                     (Math.abs(pos.x-this.click.position.x) > this.options.click.distance) || (Math.abs(pos.y-this.click.position.y) > this.options.click.distance) )
                {
	                this.deactivate(this.photos.active[this.photos.active.length-1]);
                }
            }
            else
            {
                var target = this.findTarget(pos);
                if (target != null)
                    this.activate(target, pos);
            }
        }
        else
        {
            // release hold
            if (this.photos.active.length && this.photos.active[this.photos.active.length-1].active == true)
            {
                this.deactivate(this.photos.active[this.photos.active.length-1]);
            }
        }
    },

    onMouseMove: function(event)
    {
        var el = this.elements.container.getPosition();
        var pos = {
            x: event.page.x-el.x,
            y: event.page.y-el.y
        };

        if (this.photos.active.length == 0 || this.photos.active[this.photos.active.length-1].active == false)
        {
            var target = this.findTarget(pos);
            if (target != null)
            {
                this.elements.container.style.cursor = 'move';
            }
            else
            {
                this.elements.container.style.cursor = 'default';
            }
        }
        else
        {
            var active = this.photos.active[this.photos.active.length-1];
            active.x = pos.x - active.clickOffset.x;
            active.y = pos.y - active.clickOffset.y;
            this.update({layers:'active'});
        }
    },
    
    /* Utility methods */
    getArea: function()
    {
        var size = this.elements.container.getSize();
        var area = {x:0, y:0, width:size.x, height: size.y};
        return area;
    },
    
    getPhotos: function()
    {
        return this.photos.inactive.concat(this.photos.active);    
    },
    
    scalePhotos: function(factor, options)
    {
        var options = $extend({
            photos: null
        }, options || {});
        
        if (options.photos == null)
        {
            options.photos = this.getPhotos();
        }
        if ($type(options.photos) != "array")
        {
            options.photos = $A([options.photos]);
        }
        
        options.photos.each(function(photo) {
            photo.scale = factor;
            photo.update();
        });

        return this;
    },
    
    /*
     * placement: options are pile, random and conform.
     */
    positionPhotos: function(placement, options)
    {   
        var options = $extend({
            photos: null
        }, options || {});
        
        if (options.photos == null)
        {
            options.photos = this.getPhotos();
        }
        if ($type(options.photos) != "array")
        {
            options.photos = $A([options.photos]);
        }
        
        var size = this.elements.container.getSize();
        var area = {x:0, y:0, width:size.x, height: size.y};
        
        if (placement == 'pile')
        {
            var slice = {x:size.x/3, y:size.y/3};
            area = {x:slice.x, y:slice.y, width:slice.x, height:slice.y};
        }
        
        options.photos.each(function(photo) {
            if (placement == 'pile' || placement == 'random')
            {
		        var angle = (Math.floor(Math.random() * 45) - 20);
		        photo.theta = angle * (Math.PI/180);
		        photo.x = Math.floor((Math.random() * area.width) + (area.x));
		        photo.y = Math.floor((Math.random() * area.height) + (area.y));
		        photo.update();
            }
            else if (placement == 'conform')
            {
                if (photo.x > area.width)
                    photo.x = area.width-photo.scaled.width;
                if (photo.y > area.height)
                    photo.y = area.height-photo.scaled.height;
                photo.update();
            }
        });
        
        return this;
    },
    
    normalisePhotos: function(options)
    {
        var options = $extend({
            photos: null
        }, options || {});
        
        if (options.photos == null)
        {
            options.photos = this.getPhotos();
        }
        if ($type(options.photos) != "array")
        {
            options.photos = $A([options.photos]);
        }
        
        var size = this.elements.container.getSize();
        var area = {width: size.x, height: size.y};

        options.photos.each(function(photo) {
            photo.normalise(area);
        }, this);
        return this;
    }
    
});

var PhotoData = new Class({
    Implements: [Options, Events],

    initialize: function(path, options) {
        this.setOptions(options);
        this.image = $(new Image());
        
        this.path = path;
        this.state = "not-loaded";
        
        this.image.addEvent('load', function() {
           this.state = "loaded";
           this.fireEvent('loaded', this);
        }.bind(this));

    },
    
    set: function(path) {
        this.state = 'not-loaded';
        this.path = path;
        return this;
    },
    
    load: function() {
        if (this.state == "not-loaded")
        {
            this.state = "loading";
            this.image.src = this.path;
        }
        return this;

    }

})


var PhotoElement = new Class({
    Implements: [Options, Events],

    options: {
        id: null,
        loadingIcon: null, // change this to your loading icon path
        
        border: {
            size: 15,
            colour: '#ffffff'
        },
        
        shadow: {
            rounded_blur: true, // whether shadow should have rounder corners as depth increases
            blur: 0.1, // fraction of viewport height for maximum blur distance
            steps: 12, // maximum steps for shadow blur, decrement value for improved performance
            opacity: {
                min:0.4, // when photo lifted fully from surface
                max:0.7  // when photo lying on surface
            }
        },
        
        activated: {
            scale: 1.0,
            theta: 0.0 // can be a float or the word 'random' (will not flip photo)
        },
        
        deactivated: {
            scale: 1.0, 
            theta: 0.0 // can be a float or the word 'random' (will not flip photo)
        },
        
        // if set to an element will automatically normalise against that element's size on new image set. 
        // Useful when using a lowres preview swapping to a high res.
        normalisingElement: null, 
    },

    initialize: function(options) {
        this.setOptions(options);
        this.image = null;
        this.loading = false;
    
        if (this.options.loadingIcon) {
            this.loadingIcon = $(new Image());
            this.loadingIcon.src = this.options.loadingIcon; 
        }
        else
        {
            this.loadingIcon = null;
        }
        
        this.x = 0;
        this.y = 0;
        this.scale = 1.0;
        this.theta = 0.0;

        this.active = false;
        this.activated = null; // time when activated
        this.deactivated = null; // time when deactivated
        
    },

    set: function(image)
    {
        if (image)
        {
            if (this.options.normalisingElement != null)
            {
                var size = this.options.normalisingElement.getSize();
                var area = {width: size.x, height: size.y};
                this._normalise(image, area); // don't want to change current scale
            }
            
            this.image = image;
            this.update();
            
            this.fireEvent('set', this);
        }
        return this;

    },

    _normalise: function(image, reference)
    {
        var wratio = reference.width/image.width;
        var hratio = reference.height/image.height;
        if (wratio > hratio)
        {
            // constrain to height
            var height = reference.height;
            var width = height*(image.width/image.height);
        }
        else
        {
            // constrain to width
            var width = reference.width;
            var height = width*(image.height/image.width);
        }
        image.width = width-(2*this.options.border.size);
        image.height = height-(2*this.options.border.size);        
    },
    
    normalise: function(reference)
    {
        this._normalise(this.image, reference);
        this.scale = 1.0;
        this.update();
        return this;
    },

    update: function() {
        if (this.image == null)
            return;

        this.x = parseInt(this.x);
        this.y = parseInt(this.y);

        this.width = parseInt(this.image.width);
        this.height = parseInt(this.image.height);

        if (this.options.border.size)
        {
          this.width += (2*this.options.border.size);
          this.height += (2*this.options.border.size);
        }

        this.scaled = {width: this.width*this.scale, height:this.height*this.scale};
        var scaledWidth = this.scaled.width;
        var scaledHeight = this.scaled.height;

        var hypotenuse = Math.sqrt(Math.pow(scaledWidth / 2, 2) + Math.pow(scaledHeight / 2, 2));
        var angle = Math.atan(scaledHeight / scaledWidth);
        var theta = this.theta;

        // offset added for rotate and scale actions
        var offsetX = Math.cos(angle + theta) * hypotenuse;
        var offsetY = Math.sin(angle + theta) * hypotenuse;

        var sinTh = Math.sin(theta);
        var cosTh = Math.cos(theta);

        var tl = {
            x: this.x - offsetX,
            y: this.y - offsetY
        };
        var tr = {
            x: tl.x + (scaledWidth * cosTh),
            y: tl.y + (scaledWidth * sinTh)
        };
        var br = {
            x: tr.x - (scaledHeight * sinTh),
            y: tr.y + (scaledHeight * cosTh)
        };
        var bl = {
            x: tl.x - (scaledHeight * sinTh),
            y: tl.y + (scaledHeight * cosTh)
        };

        this.bounds = { tl: tl, tr: tr, br: br, bl: bl };
        return this;
    },

    paint: function(context)
    {
        var img = this.image;
        
        // only draw if image data available (not null)
        if (img != null)
        {
            var options = this.options;
        
            context.save();
            context.translate(this.x, this.y);
            context.scale(this.scale, this.scale);
            context.rotate(this.theta);

            var center = {x:this.width/2, y:this.height/2};

            // shadow
            var shadow_ops = options.shadow;
            var multiplier = (this.scale-this.options.deactivated.scale)+0.05;
            var size = context.canvas.getSize();
            var depth = 2+((shadow_ops.blur*size.y)*multiplier);
            var offset = 0;
            var steps = shadow_ops.steps; // for performance limit maximum steps
            var step = Math.max(1, depth/steps);
            var opacity = Math.min((shadow_ops.opacity.min*(1/multiplier)), shadow_ops.opacity.max);
            var opacity_step = opacity/(depth/step);
            var radius = depth;
            for (var s=0; s<=depth; s+=step)
            {
                context.fillStyle = 'rgba(0, 0, 0, '+opacity_step+')';

                if (shadow_ops.rounded_blur)
                {
                    this._roundedRectangle(context, -center.x-s-offset, -center.y-s-offset, this.width+(2*s), this.height+(2*s), radius)
                    context.fill();
                }
                else
                {
                    context.fillRect(-center.x-s-offset, -center.y-s-offset, this.width+(2*s), this.height+(2*s));
                }
            }

            // border
            context.fillStyle = options.border.colour;
            context.fillRect(-center.x, -center.y, this.width, this.height);

            // image
            context.drawImage(
                img,
                -center.x+options.border.size,
                -center.y+options.border.size,
                img.width,
                img.height
            );
            
            // show loading image on top
            if (this.loadingIcon && this.loading == true)
            {
                var icon = this.loadingIcon;
                var width = 50;
                var iconCenter = {x:-(width/2), y:center.y-(width/2)-options.border.size};
                
                context.drawImage(
                    icon,
                    iconCenter.x,
                    iconCenter.y,
                    width,
                    width
                );
            }

            context.restore();
            
        }
        
    },

    // add this as an extension of canvas context
    _roundedRectangle: function(ctx,x,y,width,height,radius)
    {
        ctx.beginPath();
        ctx.moveTo(x,y+radius);
        ctx.lineTo(x,y+height-radius);
        ctx.quadraticCurveTo(x,y+height,x+radius,y+height);
        ctx.lineTo(x+width-radius,y+height);
        ctx.quadraticCurveTo(x+width,y+height,x+width,y+height-radius);
        ctx.lineTo(x+width,y+radius);
        ctx.quadraticCurveTo(x+width,y,x+width-radius,y);
        ctx.lineTo(x+radius,y);
        ctx.quadraticCurveTo(x,y,x,y+radius);
    },

});

// Convenience wrapper for PhotoElement and PhotoData
var Photo = new Class({
    Extends: PhotoElement,
    
    options: {
        activated: {
            scale: 0.8,
            theta: 0.0 // can be a float or the word 'random' (will not flip photo)
        },
        
        deactivated: {
            scale: 0.2, 
            theta: 'random' // can be a float or the word 'random' (will not flip photo)
        },
    },
        
    initialize: function(path, options) {
        this.parent(options);
        this.path = path;
        this.data = new PhotoData(path);
        this.data.addEvent('loaded', function(pd) {
            this.set(pd.image);
            this.loading = false;
            this.fireEvent('loaded', this);
        }.bind(this));
        this.data.load();
    },
    
    set: function(path)
    {
        if ($type(path) == "string")
        {
            this.loading = true;
            this.path = path;
            this.data.set(path).load();
        }
        else
        {
            this.parent(path);
        }
        return this;
        
    }
});
