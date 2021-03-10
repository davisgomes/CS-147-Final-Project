import {defs, tiny} from './examples/common.js';
import {Shape_From_File} from "./examples/obj-file-demo.js";
import { Body, Simulation } from "./examples/collisions-demo.js";
import {MTL_Shader} from "./mtl-shader.js";

const {
    Vector, Vector3, vec, vec3, vec4, color, hex_color, Shader, Matrix, Mat4, Light, Shape, Material, Scene, Texture, unsafe3
} = tiny;

export class Text_Line extends Shape {
    constructor(max_size) {
        super("position", "normal", "texture_coord");
        this.max_size = max_size;
        var object_transform = Mat4.identity();
        for (var i = 0; i < max_size; i++) {                                       // Each quad is a separate Square instance:
            defs.Square.insert_transformed_copy_into(this, [], object_transform);
            object_transform.post_multiply(Mat4.translation(1.5, 0, 0));
        }
    }

    set_string(line, context) {           // set_string():  Call this to overwrite the texture coordinates buffer with new
        // values per quad, which enclose each of the string's characters.
        this.arrays.texture_coord = [];
        for (var i = 0; i < this.max_size; i++) {
            var row = Math.floor(parseInt(line[i]) / 3),
                col = parseInt(line[i]) % 3;

            var skip = 3, size = 82, sizefloor = size - skip;
            var dim = 2*(size * 3),
                left = (col * size + skip)/dim, top = (row * size + skip)/dim,
                right = (col * size + sizefloor)/dim, bottom = (row * size + sizefloor)/dim;

            this.arrays.texture_coord.push(...Vector.cast([left, 1 - bottom], [right, 1 - bottom],
                [left, 1 - top], [right, 1 - top]));
        }
        if (!this.existing) {
            this.copy_onto_graphics_card(context);
            this.existing = true;
        } else
            this.copy_onto_graphics_card(context, ["texture_coord"], false);
    }
}

export class Game extends Simulation {
    /**
     *  **Base_scene** is a Scene that can be added to any display canvas.
     *  Setup the shapes, materials, camera, and lighting here.
     */
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();
        this.thrown = false;
        this.colliders = [
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(1), leeway: .5},
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(3), leeway: .1},
            {intersect_test: Body.intersect_cube, points: new defs.Cube(), leeway: .1}
        ];
        this.collider_selection = 1;

        // ** Shapes **
        this.shapes = {
            axis: new defs.Axis_Arrows(),
            board: new defs.Capped_Cylinder(5, 100, [0, 1]),
            background: new defs.Square(),
            dart: new Shape_From_File('./assets/dart.obj'),
            numbers: new Text_Line(3)
        };

        // ** Materials **
        this.materials = {
            phong: new Material(new defs.Phong_Shader(), {
                ambient: 0.5, color: hex_color("#ffffff"),
            }),
            dart_texture: new Material(new defs.Textured_Phong(), {
                color: color(0, 0, 0, 1),
                ambient: 0.5,
                diffusivity: .5,
                specularity: .5,
                diffuseMap: 3,
                stupid: 4,
                texture: new Texture("assets/gold.jpg")
            }),
            dartboard_texture: new Material(new defs.Textured_Phong(1), {
                color: color(0, 0, 0, 1),
                ambient: 1, diffusivity: .5, specularity: .5, texture: new Texture("assets/dartboard.png")
            }),
            background_texture: new Material(new defs.Textured_Phong(1), {
                color: color(0, 0, 0, 1),
                ambient: 0.8, diffusivity: .5, specularity: .5, texture: new Texture("assets/background.png")
            }),
            wall_texture: new Material(new defs.Textured_Phong(1), {
                color: color(0, 0, 0, 1),
                ambient: 0.8, diffusivity: .5, specularity: .5, texture: new Texture("assets/wall.png")
            }),
            floor_texture: new Material(new defs.Textured_Phong(1), {
                color: color(0, 0, 0, 1),
                ambient: 0.8, diffusivity: .5, specularity: .5, texture: new Texture("assets/floor.jpg")
            }),
            ceiling_texture: new Material(new defs.Textured_Phong(1), {
                color: color(0, 0, 0, 1),
                ambient: 0.8, diffusivity: .5, specularity: .5, texture: new Texture("assets/ceiling.jpg")
            }),
            nums_texture: new Material(new defs.Textured_Phong(1), {
                ambient: 1, diffusivity: 0, specularity: 0, texture: new Texture("assets/numbers.png")
            }),
            bright: new Material(new defs.Phong_Shader(1), {color: color(0, 1, 0, .5), ambient: 1})
        };

        this.initial_camera_location = Mat4.look_at(vec3(0, 10, 20), vec3(0, 0, 0), vec3(0, 1, 0));
        this.spin_angle = 0;
        this.num_left = 3;
        this.thrown = false;
        this.score = 0;
    }

    make_control_panel() {
        this.key_triggered_button("Throw dart", ["j"], () => {
            if (this.num_left >= 0) this.thrown = true
        });
        this.new_line();
    }

    draw_background(context, program_state, model_transform) {
        let background_size = 4;
        model_transform = model_transform
            .times(Mat4.scale(background_size, background_size, background_size));
        this.shapes.background.draw(context, program_state, model_transform, this.materials.background_texture);
    }

    draw_walls(context, program_state, model_transform) {
        let background_size = 4;
        let wall_length = 3;

        let model_transform1 = model_transform
            .times(Mat4.translation(4, 0, 4))
            .times(Mat4.scale(background_size * wall_length, background_size, background_size))
            .times(Mat4.rotation(Math.PI / 2, 0, 1, 0));

        let model_transform2 = model_transform
            .times(Mat4.translation(-4, 0, 4))
            .times(Mat4.scale(background_size * wall_length, background_size, background_size))
            .times(Mat4.rotation(Math.PI / 2, 0, 1, 0));

        let model_transform3 = model_transform
            .times(Mat4.translation(0, -4, 4))
            .times(Mat4.scale(background_size, background_size, background_size))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0));

        let model_transform4 = model_transform
            .times(Mat4.translation(0, 4, 4))
            .times(Mat4.scale(background_size, background_size, background_size))
            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0));

        this.shapes.background.draw(context, program_state, model_transform1, this.materials.wall_texture);
        this.shapes.background.draw(context, program_state, model_transform2, this.materials.wall_texture);
        this.shapes.background.draw(context, program_state, model_transform3, this.materials.floor_texture);
        this.shapes.background.draw(context, program_state, model_transform4, this.materials.ceiling_texture);
    }

    draw_dartboard(context, program_state, model_transform) {
        let board_pos = 1.03;
        let board_wh = 1.3;
        model_transform = model_transform
            .times(Mat4.scale(board_wh, board_wh, 0.05))
            .times(Mat4.translation(0, board_pos, 1));
        this.shapes.board.draw(context, program_state, model_transform, this.materials.dartboard_texture);
    }

    draw_dart(context, program_state, model_transform) {
        let scale_size = 0.1;
        this.spin_angle = (this.spin_angle + Math.PI / 200) % (2 * Math.PI);
        model_transform = model_transform
            .times(Mat4.translation(0, 0, 10))
            .times(Mat4.scale(scale_size, scale_size, scale_size))
            .times(Mat4.rotation(Math.PI + Math.PI / 6, 1, 0, 0))
            .times(Mat4.rotation(this.spin_angle, 0, 0, 1));
        this.shapes.dart.draw(context, program_state, model_transform, this.materials.dart_texture);
    }

    draw_arsenal(context, program_state, model_transform) {
        let scale_size = 0.1;
        let start_pos = 1.3
        let span = -0.15
        for (let i = 0; i < this.num_left; i++) {
            let model_transformi = model_transform
                .times(Mat4.translation(start_pos + i * span, -0.4, 10))
                .times(Mat4.scale(scale_size, scale_size, scale_size))
                .times(Mat4.rotation(Math.PI + Math.PI / 2, 1, 0, 0))
                .times(Mat4.rotation(this.spin_angle, 0, 0, 1));
            this.shapes.dart.draw(context, program_state, model_transformi, this.materials.dart_texture);
        }
    }

    draw_score_and_darts_left(context, program_state, model_transform) {
        let digit_size = 0.3;
        let model_transform1 = model_transform
            .times(Mat4.translation(-1.7, -2.22, 0.1))
            .times(Mat4.scale(digit_size, digit_size, digit_size));

        let model_transform2 = model_transform
            .times(Mat4.translation(1.47, -2.22, 0.1))
            .times(Mat4.scale(digit_size, digit_size, digit_size));

        this.shapes.numbers.set_string(this.score.toString().padStart(3, '0'), context.context);
        this.shapes.numbers.draw(context, program_state, model_transform1, this.materials.nums_texture);

        this.shapes.numbers.set_string(Math.max(this.num_left, 0).toString(), context.context);
        this.shapes.numbers.draw(context, program_state, model_transform2, this.materials.nums_texture);
    }

    update_state(dt) {
        // update_state():  Override the base time-stepping code to say what this particular
        // scene should do to its bodies every frame -- including applying forces.
        // Generate moving bodies:
        let model_transform = Mat4.identity();
        let dart_index = 1 + (3 - this.num_left)
        // let board_transform =
        if (this.bodies.length == 0) {
            //console.log(this.bodies.length);
            this.bodies.push(new Body(this.shapes.board, this.materials.dartboard_texture, vec3(1.4, 1.4, .1))
                .emplace(Mat4.translation(...vec3(0, 1.35, 0)),
                    vec3(0, 0, 0), 0));
        }
        if (this.bodies.length == dart_index && this.num_left >= 0) {
            //console.log(this.bodies.length);
            this.bodies.push(new Body(this.shapes.dart, this.materials.dart_texture, vec3(.5, .7, .2))
                .emplace(Mat4.translation(...vec3(0, .5, 7)).times(Mat4.rotation(Math.PI / 6, 1, 0, 0)).times(Mat4.rotation(Math.PI, 0, 1, 0)),
                    vec3(0, 0, 0), 0));
        }

        if (this.thrown) {
            // this.bodies[1].linear_velocity[1] += dt * -9.8;
            this.bodies[dart_index].linear_velocity[2] = -1;
        }

        // Sometimes we delete some so they can re-generate as new ones:
        // this.bodies = this.bodies.filter(b => (Math.random() > .01) || b.linear_velocity.norm() > 1);

        const collider = this.colliders[this.collider_selection];
        // Loop through all bodies (call each "a"):
        for (let a of this.bodies) {
            // Cache the inverse of matrix of body "a" to save time.
            a.inverse = Mat4.inverse(a.drawn_location);
            if (a.center[1] < -.5) {
                // console.log(a);
                a.linear_velocity = vec3(0, 0, 0);
                a.angular_velocity = 0;
            }

            if (a.linear_velocity.norm() == 0)
                continue;

            // *** Collision process is here ***
            // Loop through all bodies again (call each "b"):
            //for (let b of this.bodies) {
            // Pass the two bodies and the collision shape to check_if_colliding():
            if (!a.check_if_colliding(this.bodies[0], collider))
                continue;
            // If we get here, we collided, so turn red and zero out the
            // velocity so they don't inter-penetrate any further.
            a.linear_velocity = vec3(0, 0, 0);
            a.angular_velocity = 0;
            this.thrown = false;
            this.num_left -= 1;
            //this.bodies.pop();
            //}
        }
    }

    display(context, program_state) {
        super.display(context, program_state);
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            // Define the global camera and projection matrices, which are stored in program_state.
            program_state.set_camera(Mat4.translation(0, 0, -12));
        }

        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, 1, 100);

        const light_position = vec4(10, 10, -12, 1);
        program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 1000)];

        let model_transform = Mat4.identity();

        this.draw_background(context, program_state, model_transform);
        this.draw_walls(context, program_state, model_transform);
        // this.draw_dartboard(context, program_state, model_transform);
        // this.draw_dart(context, program_state, model_transform);
        this.draw_score_and_darts_left(context, program_state, model_transform);
        this.draw_arsenal(context, program_state, model_transform);

        // Draw an extra bounding sphere around each drawn shape to show
        // the physical shape that is really being collided with:
        const {points, leeway} = this.colliders[this.collider_selection];
        const size = vec3(1 + leeway, 1 + leeway, 1 + leeway);
        for (let b of this.bodies)
            points.draw(context, program_state, b.drawn_location.times(Mat4.scale(...size)), this.materials.bright, "LINE_STRIP");

    }

    increase_score(num_points) {
        this.score += num_points;
    }
}