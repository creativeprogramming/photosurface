PhotoSurface
============

Play with your photos on a surface, like you did when they weren't digital. 

You can jump right in by creating a surface and just add to it. Alternatively, you can use the lower level 
classes to implement caching and dynamic loading of higher-resolution images. 

Once the photos are added to the surface, move them around easily with click and drag or 'pick' an image up from the surface 
to see it in more detail. 

![Screenshot](http://url_to_project_screenshot)

How to use
----------

First you need a <div> element that will be the target for the new surface:

	<div id='surface'></div>
	
You'll want to ensure that the element has a width and height:

	#surface {
		position: relative;
		width: 640px;
		height: 480px;
	}

Then create a new surface instance and attach it to your element:

	var surface = new PhotoSurface().attach( $('surface') );
	
Now simply add photo paths as required:
	
	surface.add("./Assets/SunsetHigh.jpg")
	surface.add("./Assets/SkylineHigh.jpg")
	
Note that the surface will take care of only displaying the photos once they are loaded.

Read the documentation and view the demo for more information, including how to manage high resolution photos with dynamic switching.

Screenshots
-----------

![Screenshot 1](http://url_to_project_screenshot)

