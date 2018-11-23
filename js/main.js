var canvas = document.getElementById("shadow_image");
var ctx = canvas.getContext("2d");

var BOX_RESIZE_TYPE = {None:0, Right:1, Bottom:2, Corner:3};

var boundPos = {leftPos: -1, topPos: -1, rightPos: -1, bottomPos: -1, canvasWidth: -1, canvasHeight: -1,
                clipLeft: -1};
var clipSide = {left: false, top: false, right: false, bottom: false};
var shadowColor, fillColor, outlineColor, shadowBlur, shadowOffsetX, shadowOffsetY,
    outlineWidth, isTransparentFill, roundRadius, hideNinepatches,
    showContentArea;
var objectWidth = 200, objectHeight = 200;
var boxResizeMode = 0, boxResizeData = null, BOX_ANCHOR = 6;

var paddingLeft=0;
var paddingRight=0;
var paddingTop=0;
var paddingBottom=0;

var CANVAS_MIN_WIDTH = 10, CANVAS_MIN_HEIGHT = 10;
var CANVAS_MAX_WIDTH = 500, CANVAS_MAX_HEIGHT = 500;
var CONTENT_AREA_COLOR = "rgba(53, 67, 172, 0.6)";
var NINEPATCH_SIZING_WIDTH = 4;

CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
    var cornerRadius = {upperLeft: 0, upperRight: 0, lowerLeft: 0, lowerRight: 0};

    if (typeof radius === "object") {
        for (var side in radius) {
            cornerRadius[side] = radius[side];
        }
    }

    this.beginPath();
    this.moveTo(x + cornerRadius.upperLeft, y);
    this.lineTo(x + width - cornerRadius.upperRight, y);
    this.quadraticCurveTo(x + width, y, x + width, y + cornerRadius.upperRight);
    this.lineTo(x + width, y + height - cornerRadius.lowerRight);
    this.quadraticCurveTo(x + width, y + height, x + width - cornerRadius.lowerRight, y + height);
    this.lineTo(x + cornerRadius.lowerLeft, y + height);
    this.quadraticCurveTo(x, y + height, x, y + height - cornerRadius.lowerLeft);
    this.lineTo(x, y + cornerRadius.upperLeft);
    this.quadraticCurveTo(x, y, x + cornerRadius.upperLeft, y);
    this.closePath();
};

function setShadow(x, y, b, c) {
    ctx.shadowOffsetX = x;
    ctx.shadowOffsetY = y;
    ctx.shadowBlur = b;
    ctx.shadowColor = c;
}

function exportAsPng() {
    var date = new Date();
    bootbox.prompt({
        title: "Enter output filename (without '.9.png')",
        value: "shadow_" + date.getHours() + "" + date.getMinutes() + "" + date.getSeconds(),
        callback: function(result) {
            if (result !== null && result !== "") {
                //Show ninepatches If hidden when exporting
                var hideNinepatchesTmp = false;
                var showContentAreaTmp = false;
                if (hideNinepatches || showContentArea) {
                    hideNinepatchesTmp = hideNinepatches;
                    showContentAreaTmp = showContentArea;
                    showContentArea = false;
                    hideNinepatches = false;
                    redraw();
                }

                //Use BlobHD If supported
                if (canvas.toBlobHD) {
                    canvas.toBlobHD(function (blob) {
                        saveAs(blob, result + ".9.png");
                    });
                } else {
                    canvas.toBlob(function (blob) {
                        saveAs(blob, result + ".9.png");
                    });
                }

                if (hideNinepatchesTmp || showContentAreaTmp) {
                    hideNinepatches = hideNinepatchesTmp;
                    showContentArea = showContentAreaTmp;
                    redraw();
                }
            }
        }
    });
}

function predraw(w, h, radius) {
    canvas.width = CANVAS_MAX_WIDTH;
    canvas.height = CANVAS_MAX_HEIGHT;

    var transparentTmp = isTransparentFill;
    isTransparentFill = false;
    drawShadowInternal(w, h, radius, true);

    updateBounds(w, h);

    isTransparentFill = transparentTmp;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawShadow(w, h, radius, fast) {
    var paddingValues = getPaddingValues();

    //First time draw with filled background
    //for calculating final size of ninepatch
    if (!fast) {
        predraw(w, h, radius);
    }

    //Set canvas size to calculated size
    canvas.width = boundPos.canvasWidth;
    canvas.height = boundPos.canvasHeight;


    drawShadowInternal(w, h, radius, false, true);

    drawNinepatchLines(w, h, paddingValues);


    if (showContentArea) {
        drawContentArea(w, h, paddingValues);
    }
}

function drawContentArea(w, h, paddingValues) {
    w -= outlineWidth;
    h -= outlineWidth;
    ctx.fillStyle = CONTENT_AREA_COLOR;
    var outlineHalf = Math.round(outlineWidth / 2);
    var x = getRelativeX() + outlineHalf;
    var y = getRelativeY() + outlineHalf;
    var xPad = paddingValues.horizontalLeft * w;
    var yPad = paddingValues.verticalTop * h;
    ctx.fillRect(x + xPad, y + yPad,
        w - (w * paddingValues.horizontalRight) - xPad, h - (h * paddingValues.verticalBottom) - yPad);
}

function drawShadowInternal(w, h, radius, center, translate) {
    var centerPosX = Math.round((canvas.width / 2) - (w / 2));
    var centerPosY = Math.round((canvas.height / 2) - (h / 2));
    var x = 0, y = 0;
    var offsetForTransparent = -9999;

    ctx.save();
    if (isTransparentFill) ctx.translate(offsetForTransparent, offsetForTransparent);

    if (center) {
        x = centerPosX;
        y = centerPosY;
    } else if (translate) {
        x = getRelativeX();
        y = getRelativeY();
    }
    if (boxResizeMode != BOX_RESIZE_TYPE.None) {
        x -= shadowOffsetX;
        y -= shadowOffsetY;
    }
    ctx.roundRect(x, y, w, h, radius);

    if (!isTransparentFill) {
        ctx.fillStyle = fillColor;
        setShadow(shadowOffsetX, shadowOffsetY, shadowBlur, shadowColor);
    } else {
        setShadow(shadowOffsetX - offsetForTransparent, shadowOffsetY - offsetForTransparent, shadowBlur, shadowColor);
    }

    ctx.fill();

    if (!isTransparentFill && outlineWidth > 0) {
        setShadow(0,0,0,0);
        ctx.strokeStyle = outlineColor;
        ctx.lineWidth = outlineWidth;
        ctx.stroke();
    }

    ctx.restore();

    if (isTransparentFill) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        if (center) {
            x = centerPosX;
            y = centerPosY;
        } else if (translate) {
            x = getRelativeX();
            y = getRelativeY();
        }
        if (boxResizeMode != BOX_RESIZE_TYPE.None) {
            x -= shadowOffsetX;
            y -= shadowOffsetY;
        }
        ctx.roundRect(x, y, w, h, radius);
        ctx.fill();
        ctx.restore();
    }

}

function getRelativeX() {
    return Math.round((CANVAS_MAX_WIDTH / 2) - (objectWidth / 2) - boundPos.leftPos);
}

function getRelativeY() {
    return Math.round((CANVAS_MAX_HEIGHT / 2) - (objectHeight / 2) - boundPos.topPos);
}

function updateBounds(w, h) {
    boundPos.leftPos = boundPos.topPos = Number.MAX_VALUE;
    boundPos.rightPos = boundPos.bottomPos = -1;

    var imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var imageWidth = imgData.width;
    var imageHeight = imgData.height;
    var imageData = imgData.data;

    //Iterate through all pixels in image
    //used to get image bounds (where shadow ends)
    for(var i=0; i<imageData.length; i+=4) {
        if (imageData[i+3] != 0) { //check for non alpha pixel
            var x = (i / 4) % imageWidth;
            var y = Math.floor((i / 4) / imageWidth);

            if (x < boundPos.leftPos) {
                boundPos.leftPos = x;
            } else if (x > boundPos.rightPos) {
                boundPos.rightPos = x;
            }

            if (y < boundPos.topPos) {
                boundPos.topPos = y;
            } else if (y > boundPos.bottomPos) {
                boundPos.bottomPos = y;
            }
        }
    }

    var actualWidth = boundPos.rightPos - boundPos.leftPos;
    var actualHeight = boundPos.bottomPos - boundPos.topPos;
    var actualPaddingTop = imageHeight/2 - h/2 - boundPos.topPos;
    var actualPaddingBottom = boundPos.bottomPos - (imageHeight/2 + h/2);
    var actualPaddingLeft = imageWidth/2 - w/2 - boundPos.leftPos;
    var actualPaddingRight = boundPos.rightPos - (imageWidth/2 + w/2);

    var msg = ['actual size: [', actualWidth, actualHeight, ']',
        ' shadow [', actualPaddingTop, actualPaddingRight, actualPaddingBottom, actualPaddingLeft,  ']'].join(' ');
    //show the actual size
    $('#actual-padding').html(msg);

    //change to desire bounds
    if(paddingLeft != 0){
        boundPos.leftPos = (imageWidth - w) / 2 - paddingLeft;
    }
    if(paddingRight != 0){
        boundPos.rightPos = imageWidth / 2 + w / 2 + paddingLeft;
    }
    if(paddingTop != 0){
        boundPos.topPos = (imageHeight - h) / 2 - paddingTop;
    }
    if(paddingBottom != 0){
        boundPos.bottomPos = imageHeight / 2 + h / 2 + paddingBottom;
    }

    boundPos.leftPos = boundPos.leftPos - 1;
    boundPos.topPos = boundPos.topPos - 1;
    boundPos.rightPos = imageWidth - boundPos.rightPos - 2;
    boundPos.bottomPos = imageHeight - boundPos.bottomPos - 2;

    //Calculate final canvas width and height
    boundPos.canvasWidth = Math.round(canvas.width - (boundPos.leftPos + boundPos.rightPos));
    boundPos.canvasHeight = Math.round(canvas.height - (boundPos.topPos + boundPos.bottomPos));

    //Add clipping If set
    var clipLeft = clipSide.left ? getRelativeX() + roundRadius.lowerLeft: 0;
    var clipTop = clipSide.top ? getRelativeY() + roundRadius.upperLeft : 0;
    var clipRight = clipSide.right ? boundPos.canvasWidth - objectWidth - getRelativeX() + roundRadius.lowerRight: 0;
    var clipBottom = clipSide.bottom ? boundPos.canvasHeight - objectHeight - getRelativeY() + roundRadius.upperRight: 0;

    boundPos.leftPos += clipLeft;
    boundPos.topPos += clipTop;
    boundPos.rightPos += clipRight;
    boundPos.bottomPos += clipBottom;

    boundPos.clipLeft = clipLeft;

    boundPos.canvasWidth -= clipLeft + clipRight;
    boundPos.canvasHeight -= clipBottom + clipTop;
}

function getPaddingValues() {
    var rightPad = $('#padding-right').slider("getValue");
    var bottomPad = $('#padding-bottom').slider("getValue");
    var rightTop = (rightPad[0] / 100);
    var rightBottom = ((100 - rightPad[1]) / 100);
    var bottomLeft = (bottomPad[0] / 100);
    var bottomRight = ((100 - bottomPad[1]) / 100);

    return {verticalTop: rightTop, verticalBottom: rightBottom,
            horizontalLeft: bottomLeft, horizontalRight: bottomRight};
}

function drawNinepatchLines(w, h, paddingValues) {
    if (hideNinepatches) {
        return;
    }

    var s = 0;
    var offsetX = getRelativeX();
    var offsetY = getRelativeY();
    var ninepatchLineWidth = 1;
    var width = canvas.width;
    var height = canvas.height;

    //Subtract outline width from content padding
    if (!isTransparentFill) {
        var outlineHalf = Math.round(outlineWidth / 2);
        w -= outlineWidth;
        h -= outlineWidth;
        offsetX += outlineHalf;
        offsetY += outlineHalf;
    }

    //Clear 1px frame around image for ninepatch pixels
    //Top
    ctx.clearRect(0, 0, width, ninepatchLineWidth);
    //Bottom
    ctx.clearRect(0, height - ninepatchLineWidth, width, ninepatchLineWidth);
    //Left
    ctx.clearRect(0, 0, ninepatchLineWidth, height);
    //Right
    ctx.clearRect(width - ninepatchLineWidth, 0, ninepatchLineWidth, height);

    ctx.strokeStyle = "black";
    ctx.lineWidth = ninepatchLineWidth * 2;

    ctx.beginPath();

    //Draw left
    s = h / 2;
    ctx.moveTo(0, Math.round(offsetY + s - NINEPATCH_SIZING_WIDTH / 2));
    ctx.lineTo(0, Math.round(offsetY + s + NINEPATCH_SIZING_WIDTH));

    //Draw top
    s = w / 2;
    ctx.moveTo(Math.round(offsetX + s - NINEPATCH_SIZING_WIDTH / 2), 0);
    ctx.lineTo(Math.round(offsetX + s + NINEPATCH_SIZING_WIDTH), 0);

    //Draw right
    ctx.moveTo(Math.round(width), Math.round(offsetY + (h * paddingValues.verticalTop)));
    ctx.lineTo(Math.round(width), Math.round(offsetY + h - (h * paddingValues.verticalBottom - ninepatchLineWidth)));

    //Draw bottom
    ctx.moveTo(Math.round(offsetX + (w * paddingValues.horizontalLeft)), Math.round(height));
    ctx.lineTo(Math.round(offsetX + w - (w * paddingValues.horizontalRight)), Math.round(height));

    ctx.closePath();
    ctx.stroke();

    //Clear right top corner
    ctx.clearRect(width - ninepatchLineWidth, 0, ninepatchLineWidth, ninepatchLineWidth);
    //Clear right bottom corner
    ctx.clearRect(width - ninepatchLineWidth, height - ninepatchLineWidth, ninepatchLineWidth, ninepatchLineWidth);
    //Clear left bottom corner
    ctx.clearRect(0, height - ninepatchLineWidth, ninepatchLineWidth, ninepatchLineWidth);
}

function redraw(fast) {
    //Limit ranges for input
    var minRadius = 0, maxRadius = 500;
    var minOffset = -500, maxOffset = 500;
    var minBlur = 0, maxBlur = 500;
    var minOutlineW = 0, maxOutlineW = 99;

    var colorFill = $("#color-picker-fill-input");
    var outlineFill = $("#color-picker-outline-input");
    var colorShadow = $("#color-picker-shadow-input");

    shadowBlur = parseFloatAndClamp($("#shadow-blur").val(), minBlur, maxBlur);
    shadowOffsetX = parseFloatAndClamp($("#shadow-offset-x").val(), minOffset, maxOffset, 0);
    shadowOffsetY = parseFloatAndClamp($("#shadow-offset-y").val(), minOffset, maxOffset, 0);
    outlineWidth = parseFloatAndClamp($("#outline-width-input").val(), minOutlineW, maxOutlineW);
    isTransparentFill = colorFill.prop("disabled");

    shadowColor = colorShadow.val();
    fillColor = colorFill.val();
    outlineColor = outlineFill.val();

    roundRadius = {
        upperLeft: parseFloatAndClamp($("#shadow-round-tl").val(), minRadius, maxRadius),
        upperRight: parseFloatAndClamp($("#shadow-round-tr").val(), minRadius, maxRadius),
        lowerLeft: parseFloatAndClamp($("#shadow-round-bl").val(), minRadius, maxRadius),
        lowerRight: parseFloatAndClamp($("#shadow-round-br").val(), minRadius, maxRadius)
    };

    paddingTop = parseFloatAndClamp($('#padding-top-line').val(), 0, CANVAS_MAX_WIDTH, 0);
    paddingBottom = parseFloatAndClamp($('#padding-bottom-line').val(), 0, CANVAS_MAX_WIDTH, 0);
    paddingLeft = parseFloatAndClamp($('#padding-left-line').val(), 0, CANVAS_MAX_WIDTH, 0);
    paddingRight = parseFloatAndClamp($('#padding-right-line').val(), 0, CANVAS_MAX_WIDTH, 0);

    drawShadow(objectWidth, objectHeight, roundRadius, fast);
}

function parseFloatAndClamp(val, min, max, noneValue) {
    var num = parseFloat(val);
    if (isNaN(num)) {
        return (typeof noneValue !== "undefined") ? noneValue : min;
    } else {
        return Math.min(Math.max(min, val), max);
    }
}

function setRoundSimple(val) {
    $("#shadow-round-tl").val(val);
    $("#shadow-round-tr").val(val);
    $("#shadow-round-bl").val(val);
    $("#shadow-round-br").val(val);
}

/** Implementation **/

$(document).ready(function () {
    $("#shadow-blur, #shadow-offset-x, #shadow-offset-y, #shadow-round-bl, " +
    "#shadow-round-br, #shadow-round-tl, #shadow-round-tr, #outline-width-input").on("input", function() {
        redraw();
    });

    $("#round-simple-input").on("input", function () {
        setRoundSimple($(this).val());
        redraw();
    });

    $("#rectOpt, #ellipseOpt").click(function () {
        redraw();
    });

    $("#bg-color-enable").click(function () {
        if ($(this).is(":checked")) {
            $(this).colorpicker({format: "hex", align:"left"}).on("changeColor", function (ev) {
                $("#shadow_image, #main-container").css("background", ev.color.toHex());
            }).colorpicker("show");
            $(this).colorpicker("reposition");
        } else {
            $(this).colorpicker("destroy");
            $("#shadow_image, #main-container").css("background", "");
        }
    });

    $("#color-picker-shadow, #color-picker-fill, #color-picker-outline").colorpicker().on("changeColor", function(ev) {
        redraw();
    });

    //var input = "#color-picker-fill-input, #outline-width-input, #color-picker-outline-input";
    var input = "#fill-group, #outline-group";
    $("#fill-toggle").click(function () {
        var checked = $(this).is(":checked");
        if (checked) {
            $(input).find('*').prop("disabled", false);
        } else {
            $(input).find('*').prop("disabled", true);
        }

        redraw();
        $(this).blur();
    });

    $("#round-toggle").click(function () {
        var advanced = "advanced";
        var simple = "simple";

        if ($(this).text() == advanced) {
            $(this).text(simple);
            $("#round-simple").hide();
            $("#round-advanced").fadeIn("slow");
        } else {
            $(this).text(advanced);
            setRoundSimple($("#round-simple-input").val());
            $("#round-advanced").hide();
            $("#round-simple").fadeIn("slow");
        }

        redraw();
        $(this).blur();
    });

    $("#hide-patches").click(function () {
        hideNinepatches = $(this).is(":checked");
        redraw(true);
    });

    $("#show-content").click(function () {
        showContentArea = $(this).is(":checked");
        redraw(true);
    });

    $("#box-width").on("input", function () {
        objectWidth = parseFloatAndClamp($(this).val(), CANVAS_MIN_WIDTH, CANVAS_MAX_WIDTH, 0);
        redraw();
    });

    $("#box-height").on("input", function () {
        objectHeight = parseFloatAndClamp($(this).val(), CANVAS_MIN_HEIGHT, CANVAS_MAX_HEIGHT, 0);
        redraw();
    });

    $("#clip-left").click(function () {
        clipSide.left = $(this).is(":checked");
        redraw();
    });
    $("#clip-right").click(function () {
        clipSide.right = $(this).is(":checked");
        redraw();
    });
    $("#clip-top").click(function () {
        clipSide.top = $(this).is(":checked");
        redraw();
    });
    $("#clip-bottom").click(function () {
        clipSide.bottom = $(this).is(":checked");
        redraw();
    });
    $("#padding-top-line, #padding-bottom-line, #padding-left-line, #padding-right-line").on('input', function(){
        redraw();
    });

    //Resizing box
    $(this).mousemove(function f(e) {
        var mousePos = getMousePos(canvas, e);

        if (boxResizeMode != BOX_RESIZE_TYPE.None) {
            var draw = false;
            var objectWidthChanged = boxResizeData.startSizeObject.width + mousePos.x - boxResizeData.startPos.x;
            var objectHeightChanged = boxResizeData.startSizeObject.height + mousePos.y - boxResizeData.startPos.y;

            if ((boxResizeMode == BOX_RESIZE_TYPE.Right || boxResizeMode == BOX_RESIZE_TYPE.Corner) && objectWidthChanged >= CANVAS_MIN_WIDTH) {
                canvas.width = Math.round(boxResizeData.startSizeCanvas.width + mousePos.x - boxResizeData.startPos.x);
                objectWidth = Math.min(Math.round(objectWidthChanged), CANVAS_MAX_WIDTH);
                draw = true;
            }

            if ((boxResizeMode == BOX_RESIZE_TYPE.Bottom || boxResizeMode == BOX_RESIZE_TYPE.Corner) && objectHeightChanged >= CANVAS_MIN_HEIGHT) {
                canvas.height = Math.round(boxResizeData.startSizeCanvas.height + mousePos.y - boxResizeData.startPos.y);
                objectHeight = Math.min(Math.round(objectHeightChanged), CANVAS_MAX_HEIGHT);
                draw = true;
            }

            if (draw) {
                redraw();
            }
            updateSizeBoxValues();
        } else {
            isAnchor(e);
        }
    });

    $(this).mousedown(function f(e) {
        if (isAnchor(e)) {
            boxResizeData = {
                startPos: getMousePos(canvas, e),
                startSizeCanvas:{width:canvas.width, height:canvas.height},
                startSizeObject:{width:objectWidth, height:objectHeight}
            };
        }
    });
    $(this).mouseup(function f(e) {
        if (boxResizeMode != BOX_RESIZE_TYPE.None) {
            boxResizeData = null;
            boxResizeMode = BOX_RESIZE_TYPE.None;
            redraw();
        }
    });

    sliderInit();

    redraw();
    updateSizeBoxValues();
});

function sliderInit() {
    var sliderOptions = {
        formatter: function (value) {
            return value[0] + "% : " + (100 - value[1]) + "%";
        }
    };
    var sliderRight = $('#padding-right').slider(sliderOptions);
    var sliderBottom = $('#padding-bottom').slider(sliderOptions);

    sliderBottom.on("slideStart", function() {
        sliderToogleTooltip(true, false);
    }).on("slideStop", function() {
        sliderToogleTooltip(true , true);
    }).on("change", function() {
        redraw(true);
    });

    sliderRight.on("slideStart", function() {
        sliderToogleTooltip(false, false);
    }).on("slideStop", function() {
        sliderToogleTooltip(false , true);
    }).on("change", function() {
        redraw(true);
    });
}

function sliderToogleTooltip(right, visible) {
    //Fixes slider tooltip bug
    var slider;
    if (right) {
        slider = $('#padding-right-slider').find('.tooltip');
    } else {
        slider = $('#padding-bottom-slider').find('.tooltip');
    }
    if (visible) {
        slider.css("display", "");
    } else {
        slider.css("display", "none");
    }
    $("#padding-right").unbind("mouseenter mouseleave");
}

function updateSizeBoxValues() {
    $("#box-width").val(objectWidth);
    $("#box-height").val(objectHeight);
}

function isAnchor(e) {
    var mousePos = getMousePos(canvas, e);
    var rectLeft = getRelativeX();
    var rectTop = getRelativeY();
    var rectRight = rectLeft + objectWidth;
    var rectBottom = rectTop + objectHeight;

    if (boxSideCheck(mousePos, rectRight - BOX_ANCHOR, rectRight + BOX_ANCHOR, rectBottom - BOX_ANCHOR, rectBottom + BOX_ANCHOR)) {
        $(canvas).css("cursor", "se-resize");
        if (boxResizeData != null) boxResizeMode = BOX_RESIZE_TYPE.Corner;
        return true;
    } else if (boxSideCheck(mousePos, rectRight, rectRight, rectTop, rectBottom - BOX_ANCHOR)) {
        $(canvas).css("cursor", "w-resize");
        if (boxResizeData != null) boxResizeMode = BOX_RESIZE_TYPE.Right;
        return true;
    } else if (boxSideCheck(mousePos, rectLeft, rectRight - BOX_ANCHOR, rectBottom, rectBottom)) {
        $(canvas).css("cursor", "s-resize");
        if (boxResizeData != null) boxResizeMode = BOX_RESIZE_TYPE.Bottom;
        return true;
    } else {
        $(canvas).css("cursor", "default");
        return false;
    }
}

function boxSideCheck(mousePos, x1, x2, y1, y2) {
    return pointRectangleIntersection({x: mousePos.x, y:mousePos.y}, {x1: x1-BOX_ANCHOR, x2: x2+BOX_ANCHOR, y1: y1-BOX_ANCHOR, y2: y2+BOX_ANCHOR})
}

function getMousePos(canvas, evt) {
    var rect = canvas.getBoundingClientRect();
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top
    };
}

function pointRectangleIntersection(p, r) {
    return p.x > r.x1 && p.x < r.x2 && p.y > r.y1 && p.y < r.y2;
}
